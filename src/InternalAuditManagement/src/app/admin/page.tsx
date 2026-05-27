import { SiteContractAdmin } from "@/components/admin/site-contract-admin";
import { AppShell } from "@/components/layout/app-shell";

export default function AdminPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>Sites and contracts</h1>
          <p className="muted">Maintain society/site master data used across claims, queues, and MIS.</p>
        </div>
      </div>

      <SiteContractAdmin />
    </AppShell>
  );
}
