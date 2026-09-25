import { LoginForm } from "@/components/auth/login-form";
import { invitationReturnTo } from "@/lib/auth/return-to";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; next?: string | string[] }> }) {
  const { error, next } = await searchParams;
  return <LoginForm mode="register" oauthError={Array.isArray(error) ? error[0] : error} returnTo={invitationReturnTo(next)} />;
}
