export function personalizeMessage(message: string, name: string) {
  return message.replace(/{{nombre}}/g, name);
}
