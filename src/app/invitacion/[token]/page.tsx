import Link from "next/link";

import { AcceptInvitationButton } from "@/components/team/accept-invitation-button";
import { EmailVerification } from "@/components/settings/email-verification";
import { getCurrentUser } from "@/lib/auth/server";
import { getPublicInvitation, normalizeInvitationEmail } from "@/lib/invitation-repository";
import { getInvitationStatus } from "@/lib/invitation-status";
import { ROLE_LABELS } from "@/lib/team-labels";

export const dynamic = "force-dynamic";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local[0]}***@${domain}`;
}

export default async function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  const { token } = await params;
  const invitation = await getPublicInvitation(token);
  const status = invitation ? getInvitationStatus(invitation) : "INVALID";
  const invalidMessage = {
    INVALID: "Este enlace de invitación no es válido.",
    EXPIRED: "Esta invitación venció. Pedí que te envíen una nueva.",
    REVOKED: "Esta invitación fue revocada.",
    ACCEPTED: "Esta invitación ya fue aceptada.",
  } as const;
  if (status !== "PENDING" || !invitation) return <main className="app-page max-w-xl py-12"><p className="eyebrow">Invitación</p><h1 className="page-heading">Enlace no disponible</h1><p className="page-description">{status === "PENDING" ? invalidMessage.INVALID : invalidMessage[status]}</p><Link href="/" className="btn-secondary mt-6 inline-flex">Ir a Billetera</Link></main>;

  const user = await getCurrentUser();
  const returnTo = `/invitacion/${token}`;
  const emailMatches = user ? normalizeInvitationEmail(user.email) === invitation.email : false;

  return <main className="app-page max-w-xl py-12">
    <p className="eyebrow">Invitación a una cartera</p>
    <h1 className="page-heading">Te invitaron a {invitation.workspace.name}</h1>
    <div className="mt-6 space-y-2 border-y border-border py-5 text-sm"><p>Email invitado: {maskEmail(invitation.email)}</p><p>Rol: {ROLE_LABELS[invitation.role]}</p><p>Acceso: {invitation.groupScopeMode === "ALL" ? "Todos los grupos" : "Solo grupos seleccionados"}</p><p>Vence: {invitation.expiresAt.toLocaleDateString("es-AR")}</p></div>
    {!user ? <div className="mt-6 flex flex-wrap gap-3"><Link className="btn-primary" href={`/login?next=${encodeURIComponent(returnTo)}`}>Iniciar sesión</Link><Link className="btn-secondary" href={`/registro?next=${encodeURIComponent(returnTo)}`}>Crear cuenta</Link></div> : null}
    {user && !emailMatches ? <div className="mt-6"><p className="notice-error">Esta invitación fue enviada a otra dirección de correo.</p><p className="mt-3 text-sm text-muted">Ingresaste como {user.email}. Cerrá sesión e ingresá con el email invitado.</p></div> : null}
    {user && emailMatches && !user.emailVerified ? <div className="mt-6"><p className="text-sm text-muted">Verificá tu email antes de aceptar la invitación.</p><EmailVerification email={user.email} initialEmailVerified={false} /></div> : null}
    {user && emailMatches && user.emailVerified ? <div className="mt-6"><AcceptInvitationButton token={token} /></div> : null}
  </main>;
}
