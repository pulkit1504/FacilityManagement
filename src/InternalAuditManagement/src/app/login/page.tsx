import { TestLoginForm } from "@/components/auth/test-login-form";
import { testUsers } from "@/server/auth/test-users";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <TestLoginForm users={testUsers} />
    </main>
  );
}
