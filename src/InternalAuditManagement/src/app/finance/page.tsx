import { AppShell } from "@/components/layout/app-shell";
import { FinanceQueue } from "@/components/finance/finance-queue";

export default function FinancePage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Finance Reconciliation</div>
          <h1>Receipt gate and payment release</h1>
          <p className="muted">Payment cannot be released until original voucher receipt is confirmed.</p>
        </div>
      </div>
      <FinanceQueue />
    </AppShell>
  );
}
