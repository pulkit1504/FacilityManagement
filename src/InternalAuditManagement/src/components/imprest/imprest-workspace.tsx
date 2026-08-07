"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Plus, ShieldAlert, WalletCards } from "lucide-react";
import { ActionFeedback } from "@/components/ui/action-feedback";

type SiteOption = {
  siteId: string;
  siteName: string;
  clientName: string | null;
};

type PendingAdvance = {
  claimId: string;
  ticketId: string;
  company: OperatingCompany;
  siteName: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  paidAt: string;
  ageDays: number;
  settlementStatus: "Open" | "Aging" | "Overdue";
  settlementStatusLabel: string;
};

type OperatingCompany = "Nimbus" | "Striker";

export function ImprestWorkspace() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [advances, setAdvances] = useState<PendingAdvance[]>([]);
  const [company, setCompany] = useState<OperatingCompany>("Nimbus");
  const [siteId, setSiteId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [claimPeriodMonth, setClaimPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setIsLoading(true);
    try {
      const [sitesResponse, advancesResponse] = await Promise.all([
        fetch("/api/v1/sites", { cache: "no-store" }),
        fetch("/api/v1/claims/advances", { cache: "no-store" })
      ]);
      const sitesData = await sitesResponse.json();
      const advancesData = await advancesResponse.json();

      if (sitesResponse.ok) {
        const loadedSites = (sitesData.items ?? []) as SiteOption[];
        setSites(loadedSites);
        setSiteId((current) => current || loadedSites[0]?.siteId || "");
      }
      if (advancesResponse.ok) {
        setAdvances(advancesData.items ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function requestAdvance() {
    setBusy(true);
    setMessage("Submitting advance request...");
    try {
      const response = await fetch("/api/v1/claims/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          siteId,
          amount: Number(amount),
          description,
          claimPeriodMonth: `${claimPeriodMonth}-01`
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Could not request advance.");

      setAmount("");
      setDescription("");
      setMessage(`Advance request ${data.ticketId} submitted to ${data.assignedTo}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request advance.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = Boolean(siteId && description.trim().length >= 3 && Number(amount) > 0 && claimPeriodMonth);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel imprest-guidelines" aria-labelledby="imprest-guidelines-title">
        <div className="section-heading">
          <div>
            <h2 id="imprest-guidelines-title">Imprest guidelines</h2>
            <p className="muted">Complete these checks before requesting or settling an advance.</p>
          </div>
          <ShieldAlert aria-hidden="true" size={24} />
        </div>
        <div className="grid cols-2">
          <div>
            <h3>Requesting an advance</h3>
            <ul className="instruction-list">
              <li><CheckCircle2 aria-hidden="true" size={17} /> Select the site and month where the cash will be used.</li>
              <li><CheckCircle2 aria-hidden="true" size={17} /> Describe the operational purpose clearly; avoid generic descriptions.</li>
              <li><CheckCircle2 aria-hidden="true" size={17} /> Keep the request within your configured employee Imprest limit.</li>
              <li><CheckCircle2 aria-hidden="true" size={17} /> A new advance is blocked when open advances plus the request exceed that limit.</li>
            </ul>
          </div>
          <div>
            <h3>Using and settling an advance</h3>
            <ul className="instruction-list">
              <li><CheckCircle2 aria-hidden="true" size={17} /> Retain a receipt or voucher for every expense paid from the advance.</li>
              <li><CheckCircle2 aria-hidden="true" size={17} /> Apply only paid advances to reimbursement claims.</li>
              <li><CheckCircle2 aria-hidden="true" size={17} /> Enter every voucher as a separate line with its actual expense date.</li>
              <li><CheckCircle2 aria-hidden="true" size={17} /> Settle open balances promptly; only one active settlement may adjust an advance.</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-label="Request Imprest advance" className="panel" tabIndex={0}>
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Request Advance</h2>
            <p className="muted">Create an imprest advance request for Nimbus or Striker and send it through the normal approval flow.</p>
          </div>
        </div>
        <div className="grid cols-3">
          <label>
            <span className="muted">Company</span>
            <select value={company} onChange={(event) => setCompany(event.target.value as OperatingCompany)}>
              <option value="Nimbus">Nimbus</option>
              <option value="Striker">Striker</option>
            </select>
          </label>
          <label>
            <span className="muted">Site</span>
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              <option value="">Select site</option>
              {sites.map((site) => (
                <option key={site.siteId} value={site.siteId}>
                  {site.siteName}{site.clientName ? ` - ${site.clientName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Claim month</span>
            <input type="month" value={claimPeriodMonth} onChange={(event) => setClaimPeriodMonth(event.target.value)} />
          </label>
          <label>
            <span className="muted">Amount</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span className="muted">Description</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="button" disabled={busy || !canSubmit} onClick={() => void requestAdvance()} type="button">
            {busy ? <Loader2 size={18} /> : <Plus size={18} />}
            Submit advance
          </button>
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
      </section>

      <section aria-label="Open Imprest advances" className="panel" tabIndex={0}>
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Open advances</h2>
            <p className="muted">Apply paid advances against a reimbursement claim until the balance is fully adjusted.</p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Advance</th>
              <th>Company</th>
              <th>Site</th>
              <th>Amount</th>
              <th>Settled</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8}>
                  <span className="loading-inline">
                    <Loader2 size={16} />
                    Loading advances...
                  </span>
                </td>
              </tr>
            ) : null}
            {!isLoading && advances.map((advance) => (
              <tr key={advance.claimId}>
                <td>
                  <strong>{advance.ticketId}</strong>
                  <br />
                  <span className="muted">{advance.ageDays} days open</span>
                </td>
                <td>{advance.company}</td>
                <td>{advance.siteName ?? "No site linked"}</td>
                <td>Rs {advance.advanceAmount.toLocaleString("en-IN")}</td>
                <td>Rs {advance.settledAmount.toLocaleString("en-IN")}</td>
                <td>
                  <span className="badge warning">Rs {advance.advanceBalance.toLocaleString("en-IN")}</span>
                </td>
                <td>
                  <span className={`badge ${advance.settlementStatus === "Overdue" ? "danger" : advance.settlementStatus === "Aging" ? "warning" : "success"}`}>
                    {advance.settlementStatusLabel}
                  </span>
                </td>
                <td>
                  <Link className="button secondary" href={`/claims/new?advanceClaimId=${advance.claimId}`}>
                    <WalletCards size={16} />
                    Apply to expense
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && advances.length === 0 ? (
              <tr>
                <td colSpan={8}>No paid advances with an open balance.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
