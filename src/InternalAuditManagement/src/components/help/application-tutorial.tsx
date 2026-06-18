"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BadgeIndianRupee,
  Banknote,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSearch,
  FileSpreadsheet,
  Gauge,
  Landmark,
  MessageSquareText,
  Paperclip,
  ReceiptText,
  Route,
  Search,
  ShieldCheck,
  UserCog,
  WalletCards
} from "lucide-react";

type DemoRole = "claimant" | "approver" | "finance" | "auditor" | "admin";

const workflowStages = [
  {
    icon: ReceiptText,
    title: "Claimant creates the claim",
    text: "Select claim month, site, voucher type, vendor invoice, expense tag, and attach receipts line by line."
  },
  {
    icon: Route,
    title: "Approval route is calculated",
    text: "Cluster Head, HOD, and MD routing is applied from site ownership, amount thresholds, and cash-over-limit rules."
  },
  {
    icon: ClipboardCheck,
    title: "Finance checks documents",
    text: "Finance accepts or rejects voucher lines, confirms physical receipt packs, and sends complete packs to Audit."
  },
  {
    icon: ShieldCheck,
    title: "Audit reviews exceptions",
    text: "Auditor receives the pack, checks risk flags and evidence, then approves, rejects, or requests information."
  },
  {
    icon: Banknote,
    title: "Finance releases payment",
    text: "Payment release is enabled only after Audit approval and complete beneficiary details."
  }
];

const roleJourneys: Record<DemoRole, {
  title: string;
  subtitle: string;
  icon: typeof ReceiptText;
  href: string;
  actions: string[];
}> = {
  claimant: {
    title: "Claimant",
    subtitle: "Create, correct, and track imprest claims.",
    icon: ReceiptText,
    href: "/claims/new",
    actions: [
      "Start from New Claim and choose the correct expense month and site.",
      "Add every voucher as a separate line item with vendor invoice first, then expense tag.",
      "Attach receipts before submitting and download the claim summary after submission.",
      "Use My Claims to see pending location, returned reasons, and payment status."
    ]
  },
  approver: {
    title: "Approver",
    subtitle: "Review claim context and keep aging moving.",
    icon: ClipboardCheck,
    href: "/approvals",
    actions: [
      "Open Approvals to review claims pending at your level.",
      "Check amount, site, vendor, invoice, attachments, and approval trail.",
      "Approve valid claims or return with correction remarks that the claimant can act on.",
      "Use SLA chips to prioritize 3-7 day and 8+ day aging items."
    ]
  },
  finance: {
    title: "Finance",
    subtitle: "Control receipts, audit handoff, and payment release.",
    icon: Landmark,
    href: "/finance",
    actions: [
      "Open Finance Queue and review voucher lines before accepting them.",
      "Accepted lines are visually locked so the team knows the click worked.",
      "Send to Audit only after every required voucher line is accepted.",
      "Release payment only when Audit has approved and bank details are complete."
    ]
  },
  auditor: {
    title: "Auditor",
    subtitle: "Review risk, evidence, and correction loops.",
    icon: ShieldCheck,
    href: "/audit",
    actions: [
      "Use Open Risk Summary to drill into high-risk claims, aging exceptions, and pending actions.",
      "Review duplicate invoices, old expense dates, missing receipts, split bills, and manual overrides.",
      "Receive voucher packs, approve, reject, or request pending information with clear remarks.",
      "Export audit evidence when a review needs to be shared."
    ]
  },
  admin: {
    title: "Admin",
    subtitle: "Maintain master data and delivery health.",
    icon: UserCog,
    href: "/admin",
    actions: [
      "Use Setup for bulk uploads, expense heads, and holiday calendars.",
      "Use People for employees, roles, bank details, login access, and password reset.",
      "Use Sites to edit active sites, reactivate inactive sites, and map Cluster Heads.",
      "Use Mail Delivery to confirm Resend sender readiness and retry queued notifications."
    ]
  }
};

const evidenceChecklist = [
  "Receipt attachment for each saved line item",
  "Vendor name and vendor invoice number",
  "Client invoice number for B2C - Already Billed",
  "Expense date inside the selected expense month",
  "Claim summary downloaded after submission",
  "Correction remarks resolved before resubmission"
];

const demoScenario = [
  {
    label: "1",
    title: "Submit a sample reimbursement",
    text: "Claimant creates a Single Voucher claim for June 2026, selects the site, enters vendor invoice INV-1001, chooses B2C - Pending Billing, attaches the receipt, and submits."
  },
  {
    label: "2",
    title: "Approve with operating context",
    text: "Approvers review the same ticket, see the current pending location, check attachments, and approve or return it with a precise correction note."
  },
  {
    label: "3",
    title: "Finance gates the document pack",
    text: "Finance accepts each voucher line. Once all required lines are accepted, Send to Audit becomes available."
  },
  {
    label: "4",
    title: "Audit clears or challenges risk",
    text: "Audit checks evidence quality, approval trail, duplicate risk, aging, and correction history before approving."
  },
  {
    label: "5",
    title: "Payment and records close",
    text: "Finance releases payment after audit approval, while reports, claim drawer, and audit trail preserve the full decision history."
  }
];

export function ApplicationTutorial() {
  const [selectedRole, setSelectedRole] = useState<DemoRole>("claimant");
  const selected = roleJourneys[selectedRole];
  const RoleIcon = selected.icon;
  const roleOptions = useMemo(() => Object.entries(roleJourneys) as Array<[DemoRole, typeof selected]>, []);

  return (
    <div className="grid demo-hub" style={{ gap: 16 }}>
      <section className="panel demo-hero" aria-labelledby="demo-hero-title">
        <div>
          <div className="eyebrow">Guided product demo</div>
          <h2 id="demo-hero-title">Run the app like a live investor walkthrough</h2>
          <p className="muted">
            Follow one claim from creation to payment, then jump into the role-specific workspace your team uses every day.
          </p>
          <div className="demo-role-launcher" aria-label="Start a role demo">
            {roleOptions.map(([key, role]) => {
              const Icon = role.icon;
              return (
                <button
                  className={selectedRole === key ? "active" : ""}
                  key={key}
                  onClick={() => setSelectedRole(key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>{role.title} demo</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="demo-snapshot" aria-label="Demo claim summary">
          <div className="demo-ticket">
            <span className="badge warning">Demo ticket</span>
            <strong>EXP-DEMO-001</strong>
            <span className="muted">Pending at Finance receipt review</span>
          </div>
          <div className="demo-metrics">
            <div><strong>Rs 12,450</strong><span>Claim amount</span></div>
            <div><strong>2</strong><span>Voucher lines</span></div>
            <div><strong>1</strong><span>Audit flag</span></div>
          </div>
          <div className="demo-mini-trail">
            <span>Draft</span>
            <span>Submitted</span>
            <span>Approved</span>
            <span>Finance</span>
            <span>Audit</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>End-to-end workflow</h2>
            <p className="muted">The standard operating path for a clean reimbursement or advance settlement.</p>
          </div>
          <Route aria-hidden="true" size={24} />
        </div>
        <div className="demo-workflow">
          {workflowStages.map(({ icon: Icon, title, text }, index) => (
            <article className="demo-workflow-step" key={title}>
              <div className="tutorial-step-number">{index + 1}</div>
              <Icon aria-hidden="true" size={22} />
              <div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Role-based demo paths</h2>
            <p className="muted">Choose a role to see what that user should do and where they should go.</p>
          </div>
          <BookOpenCheck aria-hidden="true" size={24} />
        </div>
        <div className="demo-role-layout">
          <div className="demo-role-tabs" role="tablist" aria-label="Demo roles">
            {roleOptions.map(([key, role]) => (
              <button
                aria-selected={selectedRole === key}
                className={selectedRole === key ? "active" : ""}
                key={key}
                onClick={() => setSelectedRole(key)}
                role="tab"
                type="button"
              >
                {role.title}
              </button>
            ))}
          </div>
          <article className="demo-role-card">
            <div className="section-heading">
              <div>
                <h3>{selected.title}</h3>
                <p className="muted">{selected.subtitle}</p>
              </div>
              <RoleIcon aria-hidden="true" size={26} />
            </div>
            <ol className="demo-action-list">
              {selected.actions.map((action) => (
                <li key={action}>
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <span>{action}</span>
                </li>
              ))}
            </ol>
            <Link className="button secondary" href={selected.href}>
              Open {selected.title} workspace
            </Link>
          </article>
        </div>
      </section>

      <div className="grid cols-2">
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Demo script</h2>
              <p className="muted">Use this sequence when training new users or presenting the product.</p>
            </div>
            <Gauge aria-hidden="true" size={24} />
          </div>
          <div className="demo-script">
            {demoScenario.map((item) => (
              <article key={item.title}>
                <span>{item.label}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Evidence checklist</h2>
              <p className="muted">Use this before submitting or approving a claim.</p>
            </div>
            <FileSearch aria-hidden="true" size={24} />
          </div>
          <ul className="demo-checklist">
            {evidenceChecklist.map((item) => (
              <li key={item}>
                <CheckCircle2 aria-hidden="true" size={18} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Common controls users should know</h2>
            <p className="muted">These controls make the app faster during daily facility operations.</p>
          </div>
          <Search aria-hidden="true" size={24} />
        </div>
        <div className="tutorial-steps">
          {[
            { icon: Search, title: "Smart Search", text: "Use the sidebar search or press / to find claims, vendors, invoices, employees, billing alerts, and audit flags." },
            { icon: MessageSquareText, title: "Claim comments", text: "Use the claim drawer comments and remarks to keep correction history and decisions in one place." },
            { icon: Paperclip, title: "Receipt evidence", text: "Finance and Audit can review receipt count, missing attachments, upload metadata, and duplicate evidence signals." },
            { icon: Download, title: "Exports", text: "Claim summaries, audit trails, and finance reports can be exported for review, investor demos, or statutory backup." },
            { icon: FileSpreadsheet, title: "Bulk setup", text: "Admin can bulk upload contracts, employees, sites, and holidays using the sample CSV formats." },
            { icon: BadgeIndianRupee, title: "Imprest controls", text: "Advance limits, open balances, aging chips, and settlement rules keep cash movement controlled." },
            { icon: WalletCards, title: "Correction flow", text: "Returned claims reopen directly for editing, show the correction reason, and preserve the audit trail." },
            { icon: ShieldCheck, title: "Risk dashboard", text: "Audit can drill into open flags, high-risk claims, aging exceptions, exception queues, and action history." }
          ].map(({ icon: Icon, title, text }, index) => (
            <article className="card tutorial-step" key={title}>
              <div className="tutorial-step-number">{index + 1}</div>
              <Icon aria-hidden="true" size={22} />
              <div>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
