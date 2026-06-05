import { ShieldAlert } from "lucide-react";
import type { UserRole } from "@/server/domain/types";

type AccessDeniedPanelProps = {
  role: UserRole;
};

export function AccessDeniedPanel({ role }: Readonly<AccessDeniedPanelProps>) {
  return (
    <section className="panel access-denied">
      <div className="access-denied-icon">
        <ShieldAlert size={24} />
      </div>
      <div>
        <h1>Access restricted</h1>
        <p className="muted">
          Your current role, {role}, does not have access to this module. Use the navigation on the left to continue.
        </p>
      </div>
    </section>
  );
}
