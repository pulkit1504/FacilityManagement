"use client";

import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import type { UserRole } from "@/server/domain/types";

type CurrentTestUserProps = {
  name: string;
  role: UserRole;
};

export function CurrentTestUser({ name, role }: Readonly<CurrentTestUserProps>) {
  const [isBusy, setIsBusy] = useState(false);

  async function switchUser() {
    setIsBusy(true);
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="current-user">
      <div>
        <span>
          <UserRound size={14} aria-hidden="true" />
          {name}
        </span>
        <strong>{role}</strong>
      </div>
      <button className="nav-action" disabled={isBusy} onClick={() => void switchUser()} type="button">
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}
