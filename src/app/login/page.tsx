import { LoginForm } from "@/components/auth/login-form";
import { invitationReturnTo } from "@/lib/auth/return-to";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; next?: string | string[] }> }) {
  const { error, next } = await searchParams;
  return <LoginForm mode="login" oauthError={Array.isArray(error) ? error[0] : error} returnTo={invitationReturnTo(next)} />;
}
