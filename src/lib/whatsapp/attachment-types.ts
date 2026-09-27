export const attachmentPreviewSelect = { id: true, kind: true, status: true, caption: true } as const;
export type AttachmentPreview = { id: string; kind: string; status: string; caption: string | null };
