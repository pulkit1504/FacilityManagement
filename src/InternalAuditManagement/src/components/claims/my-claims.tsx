"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { UniversalClaimDrawer } from "@/components/claims/universal-claim-drawer";

type ClaimSummary = {
  claimId: string;
  ticketId: string;
  claimKind: "Advance" | "Reimbursement";
  submissionMode: "SingleVoucher" | "Proforma";
  status: string;
  statusLabel: string;
  totalAmount: number;
  siteId: string | null;
  siteName: string | null;
  createdAt: string;
  updatedAt: string;
};

export function MyClaims() {
  const searchParams = useSearchParams();
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const totals = useMemo(
    () => ({
      drafts: claims.filter((claim) => claim.status === "Draft").length,
      inProgress: claims.filter((claim) => ["Submitted", "HodApproved", "MdApproved", "AuditPending", "FinanceConfirmed"].includes(claim.status)).length,
      paid: claims.filter((claim) => claim.status === "PaymentReleased").length,
      returned: claims.filter((claim) => claim.status === "Rejected").length
    }),
    [claims]
  );
  const recordSearch = (searchParams.get("q") ?? "").trim().toLowerCase();
  const filteredClaims = useMemo(
    () => claims.filter((claim) => matchesText(recordSearch, [
      claim.claimId,
      claim.ticketId,
      claim.claimKind,
      claim.submissionMode,
      claim.status,
      claim.statusLabel,
      claim.siteName,
      String(claim.totalAmount)
    ])),
    [claims, recordSearch]
  );

  async function load() {
    try {
      const response = await fetch("/api/v1/claims", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.detail ?? "Could not load claims.");
        return;
      }
      setClaims(data.items ?? []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const claimId = searchParams.get("claim");
    if (claimId) setExpandedClaimId(claimId);
  }, [searchParams]);

  function toggleDetails(claimId: string) {
    setExpandedClaimId((current) => current === claimId ? null : claimId);
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid cols-3">
        <section className="card metric">
          <span>Drafts</span>
          <strong>{totals.drafts}</strong>
        </section>
        <section className="card metric">
          <span>In progress</span>
          <strong>{totals.inProgress}</strong>
        </section>
        <section className="card metric">
          <span>Paid / Returned</span>
          <strong>
            {totals.paid} / {totals.returned}
          </strong>
        </section>
      </div>

      <section className="panel">
        <div className="topbar" style={{ marginBottom: 12 }}>
          <div>
            <h2>Claim History</h2>
            <p className="muted">Track drafts, approvals, finance checks, returns, and payments.</p>
          </div>
          {recordSearch ? <span className="badge success">Search: {recordSearch}</span> : null}
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
        <table className="table">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Mode</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6}>
                  <span className="loading-inline">
                    <Loader2 size={16} />
                    Loading claims...
                  </span>
                </td>
              </tr>
            ) : null}
            {!isLoading && filteredClaims.map((claim) => (
              <Fragment key={claim.claimId}>
                <tr>
                  <td>
                    <strong>{claim.ticketId ?? claim.claimId.slice(0, 8)}</strong>
                    <br />
                    <span className="muted">{claim.claimKind} · {claim.siteName ?? "No site linked"}</span>
                  </td>
                  <td>{claim.submissionMode === "Proforma" ? "Periodic Proforma" : "Single Voucher"}</td>
                  <td>Rs {claim.totalAmount.toLocaleString("en-IN")}</td>
                  <td>
                    <span className={`badge ${statusTone(claim.status)}`}>{claim.statusLabel}</span>
                    <br />
                    <span className="muted">{claimPendingLocation(claim)}</span>
                  </td>
                  <td>{formatDate(claim.updatedAt)}</td>
                  <td>
                    <div className="actions">
                      {claim.status === "Draft" || claim.status === "Rejected" ? (
                        <Link className="button" href={`/claims/${claim.claimId}/edit`}>
                          {claim.status === "Draft" ? "Continue draft" : "Correct claim"}
                        </Link>
                      ) : null}
                      <button className="button secondary" onClick={() => toggleDetails(claim.claimId)} type="button">
                        <Eye size={16} />
                        {expandedClaimId === claim.claimId ? "Close workspace" : "Open workspace"}
                      </button>
                    </div>
                  </td>
                </tr>
              </Fragment>
            ))}
            {!isLoading && filteredClaims.length === 0 ? (
              <tr>
                <td colSpan={6}>{recordSearch ? "No claims match the current search." : "No claims found."}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <UniversalClaimDrawer
        claimId={expandedClaimId}
        isOpen={Boolean(expandedClaimId)}
        onClose={() => setExpandedClaimId(null)}
        onError={setMessage}
      />
    </div>
  );
}

function statusTone(status: string) {
  if (status === "PaymentReleased" || status === "FinanceConfirmed") return "success";
  if (status === "AuditPending") return "warning";
  if (status === "Rejected") return "danger";
  return "warning";
}

function claimPendingLocation(claim: ClaimSummary | { status: string; approvalSteps?: Array<{ requiredApproverRole: string; decision: string }>; physicalReceiptConfirmedAt?: string | null }) {
  if (claim.status === "Draft") return "With you for drafting";
  if (claim.status === "Rejected") return "With you for correction";
  if (claim.status === "PaymentReleased") return "Payment released";

  if ("approvalSteps" in claim && claim.approvalSteps) {
    const pendingStep = claim.approvalSteps
      .filter((step) => step.decision === "Pending")
      .sort((a, b) => roleOrder(a.requiredApproverRole) - roleOrder(b.requiredApproverRole))[0];
    if (pendingStep) return `Pending with ${approverRoleLabel(pendingStep.requiredApproverRole)}`;
  }

  if (claim.status === "FinanceConfirmed") return "Pending payment release by Finance";
  if (claim.status === "AuditPending") return "Pending Auditor review";
  if (claim.status === "HodApproved" || claim.status === "MdApproved") return "Pending with Finance";
  if (claim.status === "Submitted") return "Pending operational approval";
  return "Status updated";
}

function approverRoleLabel(role: string) {
  const labels: Record<string, string> = {
    ClusterHead: "Cluster Head",
    HOD: "HOD",
    MD: "Managing Director",
    Finance: "Finance"
  };
  return labels[role] ?? role;
}

function roleOrder(role: string) {
  return ["ClusterHead", "HOD", "MD", "Finance"].indexOf(role);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function matchesText(query: string, values: Array<string | number | null | undefined>) {
  if (!query) return true;
  return values
    .filter((value): value is string | number => value !== null && value !== undefined)
    .some((value) => String(value).toLowerCase().includes(query));
}
