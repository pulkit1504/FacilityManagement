"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, WalletCards } from "lucide-react";

type SiteOption = {
  siteId: string;
  siteName: string;
  clientName: string | null;
};

type PendingAdvance = {
  claimId: string;
  ticketId: string;
  siteName: string | null;
  advanceAmount: number;
  settledAmount: number;
  advanceBalance: number;
  paidAt: string;
  ageDays: number;
};

export function ImprestWorkspace() {
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [advances, setAdvances] = useState<PendingAdvance[]>([]);
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
      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Request Advance</h2>
            <p className="muted">Create an imprest advance request and send it through the normal approval flow.</p>
          </div>
        </div>
        <div className="grid cols-3">
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
        {message ? <p className="muted">{message}</p> : null}
      </section>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Pending Advance Settlement</h2>
            <p className="muted">Paid advances stay here until settlement claims consume the full balance.</p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Advance</th>
              <th>Site</th>
              <th>Amount</th>
              <th>Settled</th>
              <th>Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6}>
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
                <td>{advance.siteName ?? "No site linked"}</td>
                <td>Rs {advance.advanceAmount.toLocaleString("en-IN")}</td>
                <td>Rs {advance.settledAmount.toLocaleString("en-IN")}</td>
                <td>
                  <span className="badge warning">Rs {advance.advanceBalance.toLocaleString("en-IN")}</span>
                </td>
                <td>
                  <Link className="button secondary" href={`/claims/new?kind=Settlement&advanceClaimId=${advance.claimId}`}>
                    <WalletCards size={16} />
                    Settle
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && advances.length === 0 ? (
              <tr>
                <td colSpan={6}>No paid advances pending settlement.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
