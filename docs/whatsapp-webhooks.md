# WhatsApp Cloud API webhooks

Endpoint público: `/api/webhooks/whatsapp`.

- `GET` implementa el challenge de Meta usando `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- `POST` valida `X-Hub-Signature-256` sobre los bytes originales usando `META_APP_SECRET` antes de parsear JSON.
- Los eventos se deduplican mediante `WhatsAppWebhookEvent.eventKey`.
- `phone_number_id` se resuelve con `WhatsAppConnection`; un número sin conexión conserva el evento técnico sin crear un mensaje ni asignarlo a otra cartera.
- Los mensajes entrantes se guardan sin crear contactos, tickets ni pedidos.

Las credenciales se leen únicamente en runtime y permanecen server-side.

## Registrar la conexión inicial

Después de aplicar la migración, elegir explícitamente el Workspace de desarrollo y ejecutar:

```powershell
node --env-file=.env --env-file=.env.local scripts/register-whatsapp-connection.mjs <workspace-id>
```

El script usa `WHATSAPP_WABA_ID` y `WHATSAPP_PHONE_NUMBER_ID`, valida que el Workspace exista y rechaza mover un Phone Number ID que ya pertenezca a otra cartera.

## Configuración de Meta

Callback URL:

```text
https://billetera-de-clientes.vercel.app/api/webhooks/whatsapp
```

Configurar en Vercel Production `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `META_APP_SECRET`, luego verificar el callback en Meta Developers y suscribir únicamente el campo `messages`.
