# Respuestas WhatsApp desde Bandeja

La respuesta de texto libre requiere el módulo Bandeja, los permisos `INBOX_VIEW` e `INBOX_REPLY`, acceso a la conversación, estado `OPEN` y una ventana de atención abierta (`now < lastInboundAt + 24 h`). El servidor deriva el `wa_id` y la conexión desde la conversación; el navegador solo aporta el texto y un UUID de intención.

Flujo: `Conversation.externalParticipantId` (identidad Meta) → `formatPhoneForWhatsApp(..., "meta-explicit")` → `WhatsAppMessage` local `PROCESSING` → `MetaWhatsAppProvider.sendTextMessage()` → wamid / `ACCEPTED` → webhooks `SENT`, `DELIVERED`, `READ`. La normalización de `Client.phone` no interviene.

Por ahora las credenciales Meta son globales y sirven **solo** si `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_WABA_ID` coinciden exactamente con la `WhatsAppConnection` de la conversación. No hay fallback a otra conexión. Embedded Signup deberá resolver credenciales por conexión y cartera en el futuro.

El UUID `clientRequestId` es único por cartera y evita reenvíos por doble submit. Un rechazo HTTP definitivo queda `FAILED`; timeout o desconexión ambigua queda `UNKNOWN`. No hay reintentos automáticos, porque Meta podría haber aceptado la solicitud. El mensaje local persiste incluso si falla. No se mantiene una transacción abierta durante la llamada externa.

`MESSAGE_PROVIDER=mock` sigue gobernando campañas; la Bandeja usa un flujo Meta separado. No se envían plantillas fuera de ventana ni se marcan mensajes entrantes como leídos en Meta en esta fase.
