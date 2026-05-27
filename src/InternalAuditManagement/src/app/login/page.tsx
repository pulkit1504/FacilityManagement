import { MicrosoftLoginForm } from "@/components/auth/microsoft-login-form";
import { TestLoginForm } from "@/components/auth/test-login-form";
import { testUsers } from "@/server/auth/test-users";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const useTestLogin = process.env.APP_AUTH_MODE === "test";

  return (
    <main className="login-shell">
      {useTestLogin ? <TestLoginForm users={testUsers} /> : <MicrosoftLoginForm error={error} />}
    </main>
  );
}
