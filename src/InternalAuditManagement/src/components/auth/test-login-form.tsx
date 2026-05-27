"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import type { TestUser } from "@/server/auth/test-users";

export function TestLoginForm({ users }: Readonly<{ users: TestUser[] }>) {
  const [selected, setSelected] = useState(`${users[0]?.userId}:${users[0]?.role}`);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function signIn() {
    const [userId, role] = selected.split(":");
    setIsBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/v1/auth/test-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.detail ?? "Could not sign in.");
        return;
      }

      window.location.href = "/";
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="panel login-panel">
      <h1>Tester Access</h1>
      <p className="muted">Choose a test profile to explore the workflow.</p>
      <label>
        <span className="muted">Test user</span>
        <select value={selected} onChange={(event) => setSelected(event.target.value)}>
          {users.map((user) => (
            <option key={`${user.userId}:${user.role}`} value={`${user.userId}:${user.role}`}>
              {user.name} - {user.role}
            </option>
          ))}
        </select>
      </label>
      <button className="button" disabled={isBusy} onClick={() => void signIn()} type="button">
        <LogIn size={18} />
        {isBusy ? "Signing in..." : "Continue"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}
