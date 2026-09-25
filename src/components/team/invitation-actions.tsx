"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resendInvitationAction, revokeInvitationAction } from "@/app/equipo/invitation-actions";

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  function run(action: "resend" | "revoke") {
    if (action === "revoke" && !window.confirm("¿Revocar esta invitación? El enlace dejará de funcionar.")) return;
    setMessage(undefined); setError(undefined);
    startTransition(async () => {
      const result = action === "resend" ? await resendInvitationAction(invitationId) : await revokeInvitationAction(invitationId);
      if (!result.success) { setError(result.error); return; }
      if (action === "resend") setMessage(result.emailSent ? "Reenviada." : "Se renovó el enlace, pero el email no pudo enviarse.");
      else setMessage("Revocada.");
      router.refresh();
    });
  }
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <button className="underline underline-offset-2 disabled:opacity-50" disabled={pending} onClick={() => run("resend")} type="button">Reenviar</button>
    <button className="underline underline-offset-2 disabled:opacity-50" disabled={pending} onClick={() => run("revoke")} type="button">Revocar</button>
    {message ? <span className="text-emerald-700" role="status">{message}</span> : null}
    {error ? <span className="text-red-700" role="alert">{error}</span> : null}
  </div>;
}
