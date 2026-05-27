import { SiteContractAdmin } from "@/components/admin/site-contract-admin";
import { AppShell } from "@/components/layout/app-shell";

export default function AdminPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Operational setup</h1>
          <p className="muted">Maintain employees, approvers, holidays, sites, and client contracts.</p>
        </div>
      </div>

      <SiteContractAdmin />
    </AppShell>
  );
}
