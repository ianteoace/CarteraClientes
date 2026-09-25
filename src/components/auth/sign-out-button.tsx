"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  return <button aria-label="Cerrar sesión" className="rounded-md px-2.5 py-2 text-sm font-medium text-[#a8a8a8] transition-colors hover:bg-[#1a1a1a] hover:text-white" onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} type="button">Cerrar sesión</button>;
}
