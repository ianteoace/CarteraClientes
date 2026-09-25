import "server-only";

import { ROLE_LABELS } from "@/lib/team-labels";
import type { WorkspaceRole } from "@prisma/client";

export class InvitationEmailError extends Error {}

function publicAppUrl() {
  const configured = process.env.APP_URL?.trim();
  const production = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  const raw = configured || (production ? `https://${production}` : undefined)
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new InvitationEmailError("APP_URL no es una URL válida."); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new InvitationEmailError("APP_URL debe usar HTTPS fuera del entorno local.");
  }
  if (url.username || url.password) throw new InvitationEmailError("APP_URL no puede contener credenciales.");
  return url.origin;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export async function sendWorkspaceInvitationEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  expiresAt: Date;
  token: string;
}) {
  const key = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.INVITATION_FROM_EMAIL?.trim();
  const fromName = (process.env.INVITATION_FROM_NAME?.trim() || "Billetera").replace(/[\r\n<>]/g, "").slice(0, 80);
  if (!key || !fromEmail || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail)) {
    throw new InvitationEmailError("Falta configurar el remitente o la clave de Resend.");
  }
  const link = new URL(`/invitacion/${input.token}`, publicAppUrl()).toString();
  const expires = input.expiresAt.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
  const subject = `Invitación a ${input.workspaceName.replace(/[\r\n]/g, " ").slice(0, 100)}`;
  const text = `${input.inviterName} te invitó a colaborar en ${input.workspaceName}.\n\nRol: ${ROLE_LABELS[input.role]}\n\nAceptar invitación: ${link}\n\nEsta invitación vence el ${expires}.\n\nSi no la esperabas, podés ignorar este correo.`;
  const html = `<p>${escapeHtml(input.inviterName)} te invitó a colaborar en <strong>${escapeHtml(input.workspaceName)}</strong>.</p><p>Rol: ${escapeHtml(ROLE_LABELS[input.role])}</p><p><a href="${escapeHtml(link)}">Aceptar invitación</a></p><p>Esta invitación vence el ${escapeHtml(expires)}.</p><p>Si no la esperabas, podés ignorar este correo.</p>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [input.to], subject, text, html }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new InvitationEmailError("Resend no aceptó el correo de invitación.");
  } catch {
    throw new InvitationEmailError("No se pudo enviar el correo de invitación.");
  }
}
