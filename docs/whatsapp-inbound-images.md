# Imágenes entrantes de WhatsApp

Solo JPEG/PNG inbound, hasta 5 MB. No se envían imágenes ni se crean contactos automáticamente.

## Flujo y almacenamiento

El webhook firmado persiste Message/Conversation/Attachment en una transacción corta. Después del commit, el mismo cliente Meta consulta el mediaId con el Phone Number ID de la conexión, descarga usando autorización servidor y valida MIME, tamaño, firma binaria y SHA-256 cuando existe. La URL temporal no se guarda ni se entrega al navegador.

El binario se guarda en Vercel Blob **privado**, con un pathname estable compuesto exclusivamente por IDs. `BLOB_STORE_ID` identifica el store; el SDK resuelve OIDC de Vercel automáticamente. No se requiere `BLOB_READ_WRITE_TOKEN`. Para desarrollo, vincular el proyecto existente y actualizar el contexto OIDC con `vercel env pull`; no versionar ese archivo.

Attachment usa PENDING → PROCESSING → READY/FAILED. Una actualización condicional toma un lease de 120 segundos; los procesos concurrentes no adquieren el mismo lease. Un webhook duplicado READY no realiza IO. Si una subida tuvo resultado ambiguo, el reintento comprueba primero el mismo pathname privado y recupera el blob, sin crear otro. No hay transacción distribuida ni IO externo dentro de una transacción SQL. Los fallos transitorios retornan un error al webhook para que Meta reintente; hay un máximo de cinco intentos. MIME/URL/checksum inválidos son fallos terminales. La imagen permanece en el historial aunque falle el attachment.

## Acceso

`/api/bandeja/attachments/[id]` funciona como proxy privado: verifica sesión, membership del Workspace activo, módulo INBOX, INBOX_VIEW y scope de la Conversation **en cada lectura**. Luego transmite el blob sin exponer URLs o credenciales. Las respuestas son `private, no-store`; Next Image usa `unoptimized` para evitar un cache público. La misma protección aplica a miniaturas del origen de Tickets/Pedidos.

## Pruebas

`npm run test:whatsapp-images` usa la DB configurada, crea workspaces de QA aislados y los elimina con sus mensajes, attachments, eventos y Activity. Meta/Blob se inyectan: no envía WhatsApp ni escribe blobs reales. A–AJ cubren parser, media, retries/concurrencia, seguridad, fuentes mixtas y verificaciones estructurales de UI. AK/AL corresponden a `npm run test:inbox-reply` y `npm run test:case-conversation`.

El smoke manual autenticado verifica el render y el flujo real: enviar **una** imagen pequeña JPEG/PNG desde WhatsApp a la conexión ya configurada, abrir Bandeja y su lightbox; seleccionar TEXT + IMAGE para abrir el formulario de Ticket/Pedido sin necesidad de guardarlo. No enviar imágenes outbound.
