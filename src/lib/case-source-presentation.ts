export function buildCaseSourceDescription(messages: Array<{ type: string; textBody: string | null; attachments?: { caption: string | null }[] }>) {
  return messages.map((message) => message.type === "TEXT" ? message.textBody?.trim() : message.type === "IMAGE" && message.attachments?.[0]?.caption
    ? `Descripción de imagen: ${message.attachments[0].caption.trim()}` : null).filter(Boolean).join("\n\n");
}
