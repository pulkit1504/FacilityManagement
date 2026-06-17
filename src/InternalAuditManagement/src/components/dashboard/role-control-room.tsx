"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, Clock3, FileText, Loader2, ShieldCheck } from "lucide-react";
import type { UserRole } from "@/server/domain/types";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { ExportCenter } from "@/components/dashboard/export-center";

type RoleControlRoomProps = {
  role: UserRole;
};

type WorkItem = {
  amount?: number;
  days?: number;
  href: string;
  label: string;
  status: string;
  title: string;
  tone: "success" | "warning" | "danger";
};

export function RoleControlRoom({ role }: RoleControlRoomProps) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const nextItems = await loadRoleItems(role);
        if (isMounted) setItems(nextItems);
      } catch {
        if (isMounted) setMessage("Could not load role action center. Open the queue page to continue working.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [role]);

  const summary = useMemo(() => ({
    actionNeeded: items.filter((item) => item.tone !== "success").length,
    critical: items.filter((item) => item.tone === "danger").length,
    ready: items.filter((item) => item.tone === "success").length
  }), [items]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{roleHomeTitle(role)}</h2>
            <p className="muted">{roleHomeSubtitle(role)}</p>
          </div>
          <Link className="button secondary" href={primaryQueueHref(role)}>
            <FileText size={16} />
            Open queue
          </Link>
        </div>
        <ActionFeedback message={message} onDismiss={() => setMessage("")} />
        <div className="grid cols-3">
          <section className="card metric">
            <span>Action needed</span>
            <strong>{isLoading ? "..." : summary.actionNeeded}</strong>
          </section>
          <section className="card metric">
            <span>Critical / blocked</span>
            <strong>{isLoading ? "..." : summary.critical}</strong>
          </section>
          <section className="card metric">
            <span>Ready / complete</span>
            <strong>{isLoading ? "..." : summary.ready}</strong>
          </section>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Today&apos;s Work</h2>
            <p className="muted">Action-first queue for the current role.</p>
          </div>
        </div>
        {isLoading ? (
          <span className="loading-inline">
            <Loader2 size={16} />
            Loading action queue...
          </span>
        ) : null}
        {!isLoading ? (
          <div className="action-card-grid">
            {items.slice(0, 6).map((item) => (
              <Link className={`action-card ${item.tone}`} href={item.href} key={`${item.href}:${item.title}`}>
                {item.tone === "danger" ? <AlertTriangle size={18} /> : item.tone === "warning" ? <Clock3 size={18} /> : <CheckCircle2 size={18} />}
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.label}</span>
                  <small>{item.status}{typeof item.days === "number" ? ` | ${agingLabel(item.days)}` : ""}</small>
                </div>
              </Link>
            ))}
            {items.length === 0 ? <p className="muted">No urgent work is waiting in this role queue.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Notification Center</h2>
            <p className="muted">Important workflow events that need attention.</p>
          </div>
          <Bell size={18} />
        </div>
        <div className="notification-list">
          {notificationHints(role, summary.actionNeeded).map((item) => (
            <Link className="notification-item" href={item.href} key={item.title}>
              <ShieldCheck size={16} />
              <div>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <ExportCenter role={role} />
    </div>
  );
}

async function loadRoleItems(role: UserRole): Promise<WorkItem[]> {
  if (role === "Claimant") {
    const claims = await jsonItems("/api/v1/claims");
    return claims.map((claim) => ({
      amount: claim.totalAmount,
      days: daysSince(claim.updatedAt),
      href: claim.status === "Draft" || claim.status === "Rejected" ? `/claims/${claim.claimId}/edit` : "/claims",
      label: claim.ticketId ?? claim.claimId,
      status: claim.statusLabel ?? claim.status,
      title: claim.status === "Rejected" ? "Correct returned claim" : claim.status === "Draft" ? "Finish draft claim" : "Track claim status",
      tone: claimTone(claim.status)
    }));
  }

  if (role === "ClusterHead" || role === "HOD") {
    const approvals = await jsonItems("/api/v1/approvals/queue");
    return approvals.map((item) => ({
      amount: item.finalPayableAmount,
      days: item.daysPending,
      href: "/approvals",
      label: item.ticketId ?? item.claimId,
      status: `${item.submittedBy}${item.siteName ? ` | ${item.siteName}` : ""}`,
      title: item.urgencyLevel === "Overdue" ? "Escalated approval pending" : "Operational approval pending",
      tone: item.urgencyLevel === "Overdue" ? "danger" as const : item.urgencyLevel === "Attention" ? "warning" as const : "success" as const
    }));
  }

  if (["Finance"].includes(role)) {
    const [queue, advances] = await Promise.all([jsonItems("/api/v1/finance/queue"), jsonItems("/api/v1/finance/advances")]);
    return [
      ...queue.map((item) => ({
        amount: item.finalPayableAmount,
        days: item.daysPending,
        href: "/finance",
        label: item.ticketId ?? item.claimId,
        status: financeStatus(item),
        title: item.status === "FinanceConfirmed" ? "Release payment" : "Review vouchers",
        tone: item.status === "FinanceConfirmed" || item.physicalReceiptConfirmed ? "success" as const : "warning" as const
      })),
      ...advances.map((item) => ({
        amount: item.advanceBalance,
        days: item.ageDays,
        href: "/finance",
        label: item.ticketId ?? item.claimId,
        status: item.settlementStatusLabel,
        title: "Open advance balance",
        tone: item.settlementStatus === "Overdue" ? "danger" as const : item.settlementStatus === "Aging" ? "warning" as const : "success" as const
      }))
    ];
  }

  if (role === "Auditor" || role === "MD") {
    const [queue, flags] = await Promise.all([jsonItems("/api/v1/audit/queue"), jsonItems("/api/v1/fraud/flags?status=Open", "flags")]);
    return [
      ...queue.map((item) => ({
        amount: item.finalPayableAmount,
        days: item.daysPending,
        href: "/audit",
        label: item.ticketId ?? item.claimId,
        status: item.auditorVoucherReceivedAt ? "Ready for audit decision" : "Mark vouchers received",
        title: item.auditorVoucherReceivedAt ? "Audit decision needed" : "Receive voucher pack",
        tone: item.daysPending >= 8 ? "danger" as const : "warning" as const
      })),
      ...flags.map((flag) => ({
        amount: flag.totalAmount,
        days: flag.daysOpen,
        href: "/audit",
        label: flag.ticketId ?? flag.primaryClaimId,
        status: flag.ruleLabel ?? flag.ruleName,
        title: "Review audit exception",
        tone: flag.daysOpen >= 8 ? "danger" as const : "warning" as const
      }))
    ];
  }

  if (role === "BillingTeam") {
    const alerts = await jsonItems("/api/v1/billing/alerts");
    return alerts.map((alert) => ({
      amount: alert.billableAmount,
      days: alert.daysOpen,
      href: "/billing",
      label: alert.claimId,
      status: alert.urgencyLabel,
      title: "Link client invoice",
      tone: alert.daysOpen >= 8 ? "danger" as const : "warning" as const
    }));
  }

  if (role === "Admin") {
    const data = await jsonObject("/api/v1/admin/master-data");
    return [
      {
        href: "/admin",
        label: `${data.employees?.filter((employee: { isActive: boolean }) => employee.isActive).length ?? 0} active employees`,
        status: "Master data health",
        title: "Review employee and site setup",
        tone: "success"
      },
      {
        href: "/admin",
        label: `${data.holidays?.length ?? 0} holidays configured`,
        status: "Calendar governance",
        title: "Maintain holidays",
        tone: "success"
      }
    ];
  }

  return [];
}

async function jsonItems(url: string, key = "items") {
  const data = await jsonObject(url);
  return Array.isArray(data[key]) ? data[key] : [];
}

async function jsonObject(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail ?? "Request failed.");
  return data;
}

function claimTone(status: string): WorkItem["tone"] {
  if (status === "Rejected") return "danger";
  if (status === "PaymentReleased") return "success";
  return "warning";
}

function financeStatus(item: { physicalReceiptConfirmed?: boolean; status?: string }) {
  if (item.status === "FinanceConfirmed") return "Audit approved, ready for payment";
  return item.physicalReceiptConfirmed ? "Sent to Audit" : "Voucher review pending";
}

function roleHomeTitle(role: UserRole) {
  const labels: Record<string, string> = {
    Admin: "Admin readiness center",
    Auditor: "Audit command center",
    BillingTeam: "Billing recovery center",
    Claimant: "Claimant workbench",
    ClusterHead: "Approval workbench",
    Finance: "Finance control desk",
    HOD: "Approval workbench",
    MD: "Executive review center"
  };
  return labels[role] ?? "Role control room";
}

function roleHomeSubtitle(role: UserRole) {
  if (role === "Finance") return "Voucher packs, audit handoffs, open advances, and payment readiness in one place.";
  if (role === "Auditor") return "Audit decisions, risk exceptions, evidence, and aging priorities in one place.";
  if (role === "Claimant") return "Drafts, corrections, payments, and claim status without hunting through screens.";
  if (role === "BillingTeam") return "Unbilled B2C recovery alerts prioritized by age and exposure.";
  if (role === "Admin") return "Master data and governance signals that keep the workflow healthy.";
  return "Approvals, exceptions, and aging work routed to your role.";
}

function primaryQueueHref(role: UserRole) {
  if (role === "Finance") return "/finance";
  if (role === "Auditor" || role === "MD") return "/audit";
  if (role === "BillingTeam") return "/billing";
  if (role === "Admin") return "/admin";
  if (["ClusterHead", "HOD"].includes(role)) return "/approvals";
  return "/claims";
}

function notificationHints(role: UserRole, actionNeeded: number) {
  return [
    {
      href: primaryQueueHref(role),
      text: actionNeeded > 0 ? `${actionNeeded} item(s) need a decision or correction.` : "No urgent workflow items are waiting.",
      title: "Workflow inbox"
    },
    {
      href: role === "Claimant" ? "/claims" : primaryQueueHref(role),
      text: "Open each claim workspace to inspect receipts, approvals, remarks, and exports.",
      title: "Claim evidence updates"
    }
  ];
}

function agingLabel(days: number) {
  if (days <= 2) return "0-2 days";
  if (days <= 7) return "3-7 days";
  return "8+ days escalation";
}

function daysSince(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}
