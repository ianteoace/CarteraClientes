# WhatsApp Cloud API

`MetaWhatsAppProvider` reutiliza el cliente server-side de `src/lib/whatsapp/client.ts`. La preparación del destinatario está aislada en `src/lib/whatsapp/phone.ts` para no cambiar la normalización interna de Contactos.

Flujo de un contacto: `Client.phone` → `normalizePhone` interno → `formatPhoneForWhatsApp` → `to` de Meta.

Un destinatario técnico ya escrito en el formato exacto de Meta usa `recipientFormat: "meta-explicit"`: se aplica `trim`, se valida que contenga solo dígitos y llega sin reescrituras al campo `to`. Este modo corresponde a `WHATSAPP_TEST_RECIPIENT` en los smoke tests; no debe usarse para reinterpretar datos de Contactos.

Las campañas actuales contienen texto libre. Aunque la factory reconoce `MESSAGE_PROVIDER="meta"`, el servicio de campañas rechaza ese proveedor antes de procesar destinatarios. La integración de campañas con Meta requerirá un modo específico que guarde template aprobado, idioma y variables.

`WHATSAPP_WABA_ID` se valida y conserva en la configuración para la futura fase de webhooks, pero todavía no se usa para suscripciones. Ninguna credencial debe versionarse ni enviarse al navegador.
