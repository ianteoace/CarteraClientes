# Email inbound · Fase 1

Resend recibe el email; Billetera verifica `email.received` con Svix sobre el cuerpo
original y consulta `GET /emails/receiving/:id?html_format=cid`. No envía ni responde
emails, no descarga adjuntos y no utiliza SMTP de Neon Auth ni el servicio de invitaciones.

## Configuración manual

1. Resend → **Receiving**: confirmar la dirección inbound real. El dominio
   `*.resend.app` ya pertenece a Resend; un dominio propio requiere los registros
   MX indicados por su consola. No modificar DNS para el dominio administrado.
2. Resend → **Webhooks** → agregar endpoint
   `https://billetera-de-clientes.vercel.app/api/webhooks/email`, evento **email.received**.
3. Vercel → proyecto → Settings → Environment Variables → **Production**:
   - `RESEND_INBOUND_WEBHOOK_SECRET`: signing secret del webhook anterior.
   - `RESEND_INBOUND_API_KEY`: API key de Resend que permita consultar emails recibidos.
     Una key limitada a enviar emails no sirve. Preferir una key separada.
4. Redeploy desde el commit actual para incorporar las variables. No colocarlas
   en Git, navegador, EmailConnection ni archivos versionados.
5. Registrar una dirección exacta, con acceso administrativo a la base y las
   variables locales ignoradas por Git:

```powershell
node --env-file=.env --env-file-if-exists=.env.local scripts/register-email-connection.mjs WORKSPACE_ID DIRECCION_REAL "Nombre visible"
```

El registro es idempotente y rechaza una dirección que pertenezca a otro Workspace.
No habilita todas las direcciones del catch-all. Un destinatario desconocido se
audita como no manejado, sin fallback a ninguna cartera.

Las credenciales inbound son configuración técnica servidor para esta fase.
Una futura fase SaaS deberá resolver credenciales por Workspace; las conexiones
actuales no contienen secretos. El estado ACTIVE indica una conexión registrada,
no una prueba de entrega ni de validez de credenciales.

## Persistencia, seguridad y lectura

- EmailConnection: dirección normalizada única por proveedor, en un Workspace.
- Conversation EMAIL: identidad de thread única por Workspace/conexión. Se usan
  Message-ID, In-Reply-To y References; nunca solo asunto o remitente.
- EmailMessage: Message-ID/provider ID únicos dentro de la conexión, snapshots y
  timestamps. Fechas receivedAt gobiernan la cronología, incluso con entregas tardías.
- EmailWebhookEvent: auditoría limitada a IDs, tipo y contadores; no cuerpos,
  direcciones, firmas, cabeceras de autorización ni secretos.
- Transacciones y advisory locks serializan replays/threading. Duplicados: 200;
  error de procesamiento: 5xx, con retry seguro del proveedor. No hay reenvíos propios.
- Normalización de direcciones y matching reutilizan `src/lib/email.ts`. Solo match
  inequívoco dentro del Workspace; no se crean contactos automáticamente. From es
  un dato operativo que puede ser falsificado, no identidad autenticada.
- La UI usa texto escapado por React. HTML se conserva en servidor, se convierte a
  texto cuando no hay text/plain y nunca se renderiza como HTML ni carga trackers.
  Límites: webhook 1 MB; respuesta API 2 MB; texto 250.000, HTML 1.000.000 caracteres.
- Adjuntos: contador/aviso solamente; sin downloads ni URLs privadas en la UI.
- Bandeja y detalle reutilizan INBOX, permisos, scopes, archive/reopen y read state
  por miembro. Email no habilita reply ni creación de Ticket/Pedido.

## QA

Aplicar `add_email_inbox` en una rama Neon aislada y configurar sus dos URLs más
`EMAIL_INBOX_QA_HOST` en un archivo local ignorado:

```powershell
node --env-file=.env.email-qa scripts/run-email-inbox-tests.mjs
node scripts/verify-visual-system.mjs --email-inbox
```

La suite A–AR usa webhooks firmados y Resend simulado, con cleanup en finally;
AS–AV se comprueban con las suites existentes de WhatsApp/Reply/Meta/images/sources.
No existe ruta QA ni se requieren sesiones inventadas o mensajes reales. Los fixtures
visuales renderizan las páginas reales, pero no validan autenticación de Production.

## Smoke real, separado de la implementación

Después de configuración, deploy y autorización, enviar exactamente un email a la
dirección registrada, asunto **Prueba Bandeja Billetera**, cuerpo:
**Hola, este es un mensaje de prueba por email.**

Verificar firma, routing, EmailMessage/Conversation únicos, asunto/cuerpo, unread,
apertura/read por miembro y mezcla con WhatsApp. No responder ni reenviar automáticamente.

Referencias oficiales: [Receiving](https://resend.com/docs/dashboard/receiving/introduction),
[Retrieve received email](https://resend.com/docs/api-reference/emails/retrieve-received-email),
[Verify webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests).
