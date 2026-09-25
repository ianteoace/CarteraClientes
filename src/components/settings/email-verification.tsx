"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

type EmailVerificationProps = {
  email: string;
  initialEmailVerified: boolean;
};

export function EmailVerification({ email, initialEmailVerified }: EmailVerificationProps) {
  const router = useRouter();
  const [emailVerified, setEmailVerified] = useState(initialEmailVerified);
  const [codeSent, setCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function sendCode() {
    setError(undefined);
    setMessage(undefined);
    setIsSending(true);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });

      if (result.error) {
        setError(result.error.message ?? "No se pudo enviar el código de verificación.");
        return;
      }

      setCodeSent(true);
      setMessage(`Enviamos un código de verificación a ${email}.`);
    } catch {
      setError("No se pudo enviar el código de verificación. Intentá nuevamente.");
    } finally {
      setIsSending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const otp = String(formData.get("verificationCode") ?? "").trim();

    if (!otp) {
      setError("Ingresá el código que recibiste por email.");
      return;
    }

    setError(undefined);
    setMessage(undefined);
    setIsVerifying(true);

    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp });

      if (result.error || !result.data?.status) {
        setError(result.error?.message ?? "El código es inválido o venció.");
        return;
      }

      setEmailVerified(true);
      setCodeSent(false);
      setMessage("Email verificado correctamente.");
      router.refresh();
    } catch {
      setError("No se pudo verificar el email. Intentá nuevamente.");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="mt-5 border-t border-zinc-200 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-zinc-950">Seguridad de la cuenta</p>
          <p className={`mt-1 text-sm ${emailVerified ? "text-emerald-700" : "text-amber-700"}`}>
            {emailVerified ? "Email verificado" : "Email sin verificar"}
          </p>
        </div>
        {!emailVerified ? (
          <button
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
            disabled={isSending || isVerifying}
            onClick={sendCode}
            type="button"
          >
            {isSending ? "Enviando..." : codeSent ? "Reenviar código" : "Verificar email"}
          </button>
        ) : null}
      </div>

      {codeSent && !emailVerified ? (
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={verifyCode}>
          <label className="flex-1 space-y-1 text-sm font-medium">
            <span>Código de verificación</span>
            <input
              autoComplete="one-time-code"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              inputMode="numeric"
              name="verificationCode"
              required
            />
          </label>
          <button
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isVerifying || isSending}
            type="submit"
          >
            {isVerifying ? "Verificando..." : "Confirmar código"}
          </button>
        </form>
      ) : null}

      {message ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
