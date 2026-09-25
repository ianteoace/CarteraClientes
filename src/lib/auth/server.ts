import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Tu sesión expiró. Iniciá sesión nuevamente.");
  }
}

export async function getCurrentUser() {
  const { data: session } = await auth.getSession();
  return session?.user ?? null;
}
