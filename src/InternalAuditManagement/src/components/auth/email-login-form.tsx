"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { getProblemMessage } from "@/components/ui/problem-message";

export function EmailLoginForm({ error }: Readonly<{ error?: string }>) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(error ?? "");
  const [isBusy, setIsBusy] = useState(false);

  async function signIn() {
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(getProblemMessage(data, "Could not sign in."));
        return;
      }

      window.location.href = "/";
    } catch {
      setMessage("Could not sign in. Check your connection and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="panel login-panel">
      <h1>Sign In</h1>
      <p className="muted">Use your registered email address and password.</p>
      <label>
        <span className="muted">Email</span>
        <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        <span className="muted">Password</span>
        <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button className="button" disabled={isBusy || !email || !password} onClick={() => void signIn()} type="button">
        <LogIn size={18} />
        {isBusy ? "Signing in..." : "Continue"}
      </button>
      <ActionFeedback message={message} />
    </section>
  );
}
