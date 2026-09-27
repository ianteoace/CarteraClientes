"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AttachmentPreview } from "@/lib/whatsapp/attachment-types";

export function ConversationImage({ attachment }: { attachment: AttachmentPreview | undefined }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const unavailable = !attachment || attachment.status === "FAILED" || failed;
  return <div className="inbox-image">
    {unavailable ? <p className="inbox-image-unavailable">Imagen no disponible</p> : attachment.status !== "READY" ? <div>
      <div className="inbox-image-skeleton" aria-label="Imagen en proceso" />
      <button className="mt-2 text-xs underline underline-offset-2" onClick={() => router.refresh()} type="button">Actualizar imagen</button>
    </div> : <>
      <button className="inbox-image-thumbnail" type="button" aria-label="Ampliar imagen recibida" onClick={() => dialog.current?.showModal()}>
        {!loaded ? <span className="inbox-image-skeleton" aria-label="Cargando imagen" /> : null}
        {/* Authenticated media must bypass the public Next Image Optimization cache. */}
        <Image unoptimized src={`/api/bandeja/attachments/${attachment.id}`} alt="Imagen recibida por WhatsApp" width={480} height={360}
          className={loaded ? "inbox-image-loaded" : "inbox-image-loading"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      </button>
      <dialog className="inbox-image-dialog" ref={dialog} aria-label="Imagen de la conversación" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="inbox-image-dialog-content">
          <button className="btn-secondary mb-3" type="button" onClick={() => dialog.current?.close()}>Cerrar</button>
          <div className="inbox-image-full"><Image unoptimized fill sizes="100vw" src={`/api/bandeja/attachments/${attachment.id}`} alt="Imagen recibida por WhatsApp" style={{ objectFit: "contain" }} onError={() => { dialog.current?.close(); setFailed(true); }} /></div>
          {attachment.caption ? <p className="mt-3 whitespace-pre-wrap break-words text-sm">{attachment.caption}</p> : null}
        </div>
      </dialog>
    </>}
    {attachment?.caption ? <p className="mt-2 whitespace-pre-wrap break-words">{attachment.caption}</p> : null}
  </div>;
}
