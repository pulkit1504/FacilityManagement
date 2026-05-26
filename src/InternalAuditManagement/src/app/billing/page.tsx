import { BillingAlerts } from "@/components/billing/billing-alerts";
import { AppShell } from "@/components/layout/app-shell";

export default function BillingPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Revenue Recovery</div>
          <h1>Billing alerts</h1>
          <p className="muted">Track Pending Billing expenses until a client invoice number is linked.</p>
        </div>
      </div>
      <BillingAlerts />
    </AppShell>
  );
}
