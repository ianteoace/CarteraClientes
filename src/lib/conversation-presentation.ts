export function maskWhatsAppParticipant(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `+${digits.slice(0, 2)}••••${digits.slice(-4)}` : "WhatsApp";
}

export function conversationPreview(message: { type: string; textBody: string | null; attachments?: { caption: string | null }[] } | null) {
  if (!message) return "Sin mensajes";
  if (message.type === "TEXT") return message.textBody?.slice(0, 80) || "Mensaje de texto";
  if (message.type === "TEMPLATE") return "Mensaje de plantilla";
  if (message.type === "IMAGE") return message.attachments?.[0]?.caption ? `Imagen · ${message.attachments[0].caption.slice(0, 80)}` : "Imagen";
  return "Mensaje no compatible";
}

export function messageStatusLabel(status: string) {
  return ({ PENDING: "Preparando", PROCESSING: "Enviando", ACCEPTED: "Enviado", SENT: "Enviado", DELIVERED: "Entregado", READ: "Leído", FAILED: "Falló", UNKNOWN: "Estado desconocido" } as Record<string, string>)[status] ?? "Estado desconocido";
}
