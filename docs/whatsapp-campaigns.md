# Campañas: simulación y WhatsApp

`MESSAGE_PROVIDER=mock` permanece sin cambios. Cada campaña elige explícitamente
`deliveryMode`: `MOCK` (default, incluidas las campañas existentes) o `META_WHATSAPP`.
Ambos modos usan `CampaignSendService` y el mismo Workflow programado.

## Plantillas y snapshots

El catálogo se consulta solamente desde el servidor contra la WABA de una
`WhatsAppConnection` activa del Workspace. Sus Phone Number ID y WABA ID deben
coincidir con las credenciales Meta disponibles; nunca se toma otra conexión
como fallback. Consultar el catálogo no envía mensajes.

Se admiten plantillas APPROVED de Marketing/Utility con BODY de texto y variables
posicionales consecutivas, HEADER TEXT y FOOTER estáticos, y botones estáticos
quick reply, URL o teléfono sin parámetros dinámicos. No se admiten media,
Flows, catálogos, autenticación, variables nombradas ni botones dinámicos.

En DRAFT pueden cambiarse la plantilla y su mapping: nombre, empresa, email,
teléfono o texto fijo. Al pasar a READY se consulta nuevamente Meta y, en una
transacción, se valida toda la audiencia (contactos existentes y autorizados,
teléfonos y parámetros válidos). Se congelan nombre/ID/idioma/categoría/components,
mapping, conexión y los valores resueltos por destinatario. Una validación
fallida no prepara parcialmente la campaña. Los cambios posteriores del
contacto, grupo u opt-in no alteran ese snapshot. Reprogramar tampoco lo regenera.

Antes de enviar se hace una consulta de revalidación por ejecución, no por
destinatario. Si la plantilla desapareció, cambió o dejó de estar aprobada, o
la conexión está deshabilitada/eliminada, se falla sin enviar pendientes.
La configuración Meta se resuelve de forma lazy; MOCK no necesita sus secretos.

## Dispatch y entrega

WhatsApp real llama únicamente a `MetaWhatsAppProvider.sendTemplateMessage()`.
Nunca convierte `Campaign.message` en un envío TEXT. El formatter interno
WhatsApp ya existente prepara el teléfono; no cambia `normalizePhone()` ni
la identidad externa de una Conversation.

Antes de cada POST se reclama PENDING → PROCESSING y se persiste una intención
WhatsAppMessage OUTBOUND/TEMPLATE única por CampaignRecipient, con UUID opaco
para correlacionar un webhook que llegue antes de la respuesta HTTP.
El wamid y el wa_id de la respuesta se guardan sin mostrarlos en la UI.

`Campaign.COMPLETED` significa dispatch completado, no 100% entregado/leído.
`dispatchAcceptedAt` conserva la aceptación HTTP aunque un webhook posterior
indique FAILED. Los webhooks actualizan el destinatario de forma monotónica:
sent → ACCEPTED, delivered → DELIVERED, read → READ, failed → FAILED cuando no
había una confirmación superior de entrega. No reabren ni reenvían la campaña.

Los claims atómicos existentes evitan doble click, procesos concurrentes y
reenvío de recipients procesados. Un rechazo HTTP definitivo queda FAILED;
un timeout/resultado ambiguo queda UNKNOWN (requiere revisión). No hay retry
automático de mensajes. Tras una interrupción abrupta, PROCESSING puede quedar
pendiente de revisión y la campaña SENDING; no se lo resetea automáticamente.
Un retry del Workflow no retransmite una intención persistida.

## Bandeja

Un outbound de campaña solamente se asocia a una Conversation que ya existe
para el mismo Workspace/conexión/wa_id. Actualiza `lastOutboundAt`, pero no
`lastMessageAt`, `lastInboundAt`, estado de lectura ni prioridad de Bandeja.
Sin conversación se guarda con `conversationId=null`. Un inbound posterior
crea/reutiliza el hilo y adjunta los outbounds históricos compatibles.
No se crean contactos automáticamente. INBOX puede estar apagado sin bloquear
CAMPAIGNS. Se reutilizan los permisos y group scopes actuales.

## Pruebas seguras

El harness permanente `scripts/run-meta-campaign-tests.mjs` requiere una rama
Neon aislada y migrada. Configurar en el proceso `DATABASE_URL`,
`DATABASE_URL_UNPOOLED` y `META_CAMPAIGNS_QA_HOST` (hostname de esa rama), y ejecutar
`npm run test:meta-campaigns`. Nunca apuntarlo a Production. Todos los requests
Meta son interceptados y simulados; los fixtures se eliminan en `finally`.
Las regresiones AY–BA se cubren con los runners existentes de Reply, webhooks
(WHATSAPP_WEBHOOK_DB_QA=1), imágenes, CaseConversation e Inbox (INBOX_DB_QA=1).

## Smoke real: autorización independiente

No ejecutar como parte de instalación, tests o deploy.

1. Con autorización explícita: Cartera Ab, conexión actual, una plantilla
   aprobada compatible (`hello_world` si está disponible), exactamente un
   contacto autorizado. Crear campaña WhatsApp real, revisar preview, marcar
   como lista y enviar una sola vez, de forma inmediata.
2. Correlacionar el wamid: ACCEPTED/SENT/DELIVERED/READ si se abre, mensaje único,
   sin nueva conversación por campaña. READ pendiente no justifica reenviar.
3. Solo después del inmediato OK y una **segunda** autorización, crear otra
   campaña de un destinatario y programarla unos minutos adelante. Confirmar
   wake del mismo Workflow, revalidación, envío, webhook e idempotencia.
