"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

type LoginFormProps = { mode: "login" | "register"; oauthError?: string; returnTo?: string };

export function LoginForm({ mode, oauthError, returnTo }: LoginFormProps) {
  const [error, setError] = useState<string | undefined>(() => oauthError ? getOAuthErrorMessage(oauthError) : undefined); const [isSubmitting, setIsSubmitting] = useState(false); const isRegister = mode === "register";
  async function continueWithGoogle() { setError(undefined); setIsSubmitting(true); try { const result = await authClient.signIn.social({ provider:"google", callbackURL:returnTo || "/", errorCallbackURL:`${isRegister ? "/registro" : "/login"}${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}` }); if (result.error) { setError(result.error.message ?? "No se pudo continuar con Google."); setIsSubmitting(false); } } catch { setError("No se pudo iniciar el acceso con Google. Intentá nuevamente."); setIsSubmitting(false); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = isRegister
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(getEmailAuthErrorMessage(result.error, isRegister));
        return;
      }

      // Force a fresh server request with the newly established session.
      window.location.replace(returnTo || "/");
    } catch (error) {
      setError(getEmailAuthErrorMessage(error, isRegister));
    } finally {
      setIsSubmitting(false);
    }
  }
  return <main className="grid min-h-screen bg-white lg:grid-cols-2"><section className="hidden bg-[#111] p-10 text-white lg:flex lg:flex-col"><Link className="text-xs font-bold tracking-[.18em]" href="/">BILLETERA</Link><div className="my-auto max-w-md"><p className="text-4xl font-bold leading-[1.02] tracking-[-.065em]">Tu cartera.<br />Tus contactos.<br />Tus grupos.</p><p className="mt-6 max-w-sm text-sm leading-7 text-[#aaa]">Organizá a las personas con las que realmente querés mantener contacto.</p></div><p className="text-xs text-[#777]">Una forma simple de tener tus relaciones a mano.</p></section><section className="flex items-center justify-center px-5 py-9 sm:px-8"><form className="w-full max-w-sm space-y-5" onSubmit={submit}><Link className="text-xs font-bold tracking-[.18em] lg:hidden" href="/">BILLETERA</Link><div className="pt-3"><p className="eyebrow">{isRegister ? "Empezá tu cartera" : "Acceso"}</p><h1 className="text-[28px] font-bold tracking-[-.05em]">{isRegister ? "Crear cuenta" : "Iniciar sesión"}</h1><p className="mt-2 text-sm text-muted">{isRegister ? "Tus contactos quedan aislados en tu propia cartera." : "Volvé a tu cartera de contactos."}</p></div><button className="btn-secondary w-full gap-2" disabled={isSubmitting} onClick={continueWithGoogle} type="button"><GoogleIcon />Continuar con Google</button><div aria-hidden="true" className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />o continuar con email<span className="h-px flex-1 bg-border" /></div>{isRegister ? <label className="field-label"><span>Nombre</span><input className="field" name="name" required /></label> : null}<label className="field-label"><span>Email</span><input autoComplete="email" className="field" name="email" required type="email" /></label><label className="field-label"><span>Contraseña</span><input autoComplete={isRegister ? "new-password" : "current-password"} className="field" minLength={8} name="password" required type="password" /></label>{error ? <p className="notice-error" role="alert">{error}</p> : null}<button className="btn-primary w-full" disabled={isSubmitting} type="submit">{isSubmitting ? "Procesando..." : isRegister ? "Crear cuenta" : "Ingresar"}</button><p className="pt-1 text-center text-sm text-muted">{isRegister ? "¿Ya tenés cuenta?" : "¿No tenés cuenta?"} <Link className="font-semibold text-black underline underline-offset-4" href={`${isRegister ? "/login" : "/registro"}${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`}>{isRegister ? "Iniciá sesión" : "Registrate"}</Link></p></form></section></main>;
}
function getOAuthErrorMessage(code: string) { switch (code) { case "account_not_linked": return "Esta cuenta ya existe. Ingresá con email y verificá tu correo desde Configuración antes de continuar con Google."; case "unable_to_link_account": return "La cuenta de Google no pudo vincularse con tu cuenta existente. Ingresá con email o usá otra cuenta de Google."; case "email_not_verified": return "Google no pudo confirmar que el email esté verificado."; case "redirect_uri_mismatch": case "invalid_client": return "La configuración de acceso con Google necesita ser revisada."; case "access_denied": return "El acceso con Google fue cancelado."; default: return "No se pudo completar el acceso con Google. Intentá nuevamente."; } }
function getEmailAuthErrorMessage(error: unknown, isRegister: boolean) {
  const details = error && typeof error === "object" ? error as { code?: string; status?: number } : {};
  if (details.code === "invalid_credentials" || details.code === "INVALID_EMAIL_OR_PASSWORD" || details.code === "user_not_found" || details.status === 401) {
    return "Email o contraseña incorrectos.";
  }
  if (details.code === "email_not_confirmed" || details.code === "EMAIL_NOT_VERIFIED") {
    return "Verificá tu email antes de ingresar.";
  }
  if (details.status && details.status >= 500) {
    return "El servicio de acceso no está disponible. Intentá nuevamente en unos minutos.";
  }
  return isRegister
    ? "No se pudo crear la cuenta. Revisá los datos e intentá nuevamente."
    : "No se pudo iniciar sesión. Revisá tu conexión e intentá nuevamente.";
}
function GoogleIcon() { return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24"><path d="M21.35 12.23c0-.71-.06-1.23-.2-1.77H12v3.38h5.37c-.11.84-.72 2.1-2.08 2.95l-.02.11 3.02 2.34.21.02c1.92-1.77 2.85-4.37 2.85-7.03Z" fill="#4285F4" /><path d="M12 21.7c2.63 0 4.83-.87 6.44-2.44l-3.07-2.47c-.82.57-1.92.97-3.37.97a5.85 5.85 0 0 1-5.53-4.04l-.1.01-3.14 2.43-.03.1A9.72 9.72 0 0 0 12 21.7Z" fill="#34A853" /><path d="M6.47 13.72A5.88 5.88 0 0 1 6.16 12c0-.6.11-1.18.3-1.72v-.12L3.29 7.7l-.1.05A9.7 9.7 0 0 0 2.3 12c0 1.53.37 2.97.9 4.24l3.27-2.52Z" fill="#FBBC05" /><path d="M12 6.23c1.83 0 3.07.8 3.78 1.46l2.76-2.7C16.82 3.4 14.63 2.3 12 2.3a9.72 9.72 0 0 0-8.81 5.45l3.27 2.54A5.88 5.88 0 0 1 12 6.23Z" fill="#EA4335" /></svg>; }
