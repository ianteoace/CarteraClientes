"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acceptInvitationAction } from "@/app/invitacion/[token]/actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  function accept() {
    setError(undefined);
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (!result.success) { setError(result.error); return; }
      if (result.alreadyMember) {
        setMessage("Ya pertenecés a esta cartera. Te estamos llevando a ella.");
        window.setTimeout(() => { router.replace("/"); router.refresh(); }, 1200);
      } else { router.replace("/"); router.refresh(); }
    });
  }
  return <div className="space-y-3"><button className="btn-primary" disabled={pending || Boolean(message)} onClick={accept} type="button">{pending ? "Aceptando..." : "Aceptar invitación"}</button>{message ? <p className="text-sm text-emerald-700" role="status">{message}</p> : null}{error ? <p className="notice-error" role="alert">{error}</p> : null}</div>;
}
