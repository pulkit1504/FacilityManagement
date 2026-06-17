"use client";

type TimelineStep = {
  label: string;
  detail: string;
  state: "done" | "current" | "waiting" | "blocked";
};

type ApprovalStep = {
  requiredApproverRole: string;
  decision: string;
  decisionAt: string | null;
  remarks: string | null;
};

type ClaimTimelineProps = {
  status: string;
  approvalSteps?: ApprovalStep[];
  physicalReceiptConfirmedAt?: string | null;
  auditorVoucherReceivedAt?: string | null;
};

export function ClaimTimeline({
  status,
  approvalSteps = [],
  physicalReceiptConfirmedAt = null,
  auditorVoucherReceivedAt = null
}: ClaimTimelineProps) {
  const steps = buildTimeline(status, approvalSteps, physicalReceiptConfirmedAt, auditorVoucherReceivedAt);

  return (
    <ol aria-label="Claim status timeline" className="claim-timeline">
      {steps.map((step) => (
        <li className={`claim-timeline-step ${step.state}`} key={step.label}>
          <span aria-hidden="true" className="claim-timeline-dot" />
          <div>
            <strong>{step.label}</strong>
            <p className="muted">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function buildTimeline(
  status: string,
  approvalSteps: ApprovalStep[],
  physicalReceiptConfirmedAt: string | null,
  auditorVoucherReceivedAt: string | null
): TimelineStep[] {
  const rejected = status === "Rejected";
  const paid = status === "PaymentReleased";
  const financeConfirmed = status === "FinanceConfirmed" || paid;
  const auditPending = status === "AuditPending" || financeConfirmed;
  const financeReached = ["HodApproved", "MdApproved", "AuditPending", "FinanceConfirmed", "PaymentReleased"].includes(status);
  const operationalApproved = financeReached || approvalSteps.some((step) => step.decision === "Approved");
  const pendingRole = approvalSteps.find((step) => step.decision === "Pending")?.requiredApproverRole ?? null;

  return [
    {
      label: "Draft",
      detail: status === "Draft" ? "Claim is still editable by claimant." : "Claim workspace created.",
      state: status === "Draft" ? "current" : "done"
    },
    {
      label: "Operational approval",
      detail: pendingRole && ["ClusterHead", "HOD", "MD"].includes(pendingRole)
        ? `Pending with ${roleLabel(pendingRole)}.`
        : operationalApproved
          ? "Manager approvals completed."
          : "Waiting for claimant submission.",
      state: rejected ? "blocked" : operationalApproved ? "done" : status === "Submitted" ? "current" : "waiting"
    },
    {
      label: "Finance voucher review",
      detail: physicalReceiptConfirmedAt
        ? "Finance accepted vouchers and sent the pack to Audit."
        : financeReached
          ? "Finance must review receipts and accept voucher lines."
          : "Starts after operational approval.",
      state: rejected ? "blocked" : physicalReceiptConfirmedAt ? "done" : financeReached ? "current" : "waiting"
    },
    {
      label: "Audit review",
      detail: auditorVoucherReceivedAt
        ? "Audit marked vouchers received and can decide."
        : auditPending
          ? "Pending Auditor voucher receipt and decision."
          : "Starts after Finance sends voucher pack.",
      state: rejected ? "blocked" : financeConfirmed ? "done" : auditPending ? "current" : "waiting"
    },
    {
      label: "Payment release",
      detail: paid ? "Payment released to claimant." : financeConfirmed ? "Ready for Finance payment release." : "Starts after Audit approval.",
      state: paid ? "done" : financeConfirmed ? "current" : rejected ? "blocked" : "waiting"
    }
  ];
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    ClusterHead: "Cluster Head",
    HOD: "HOD",
    MD: "Managing Director",
    Finance: "Finance",
    Auditor: "Auditor"
  };
  return labels[role] ?? role;
}
