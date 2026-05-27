"use client";

import { LogIn } from "lucide-react";

export function MicrosoftLoginForm({ error }: Readonly<{ error?: string }>) {
  return (
    <section className="panel login-panel">
      <h1>Sign In</h1>
      <p className="muted">Use your Microsoft work account to access Facility Control.</p>
      <a className="button" href="/api/v1/auth/login">
        <LogIn size={18} />
        Continue with Microsoft
      </a>
      {error ? <p className="muted">{error}</p> : null}
    </section>
  );
}
