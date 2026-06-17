"use client";

import { Download, FileText } from "lucide-react";
import type { UserRole } from "@/server/domain/types";

type ExportCenterProps = {
  role: UserRole;
};

export function ExportCenter({ role }: ExportCenterProps) {
  const items = exportItems(role);
  if (items.length === 0) return null;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Export Center</h2>
          <p className="muted">Download operational evidence, payout, billing, and audit reports from one place.</p>
        </div>
      </div>
      <div className="action-card-grid">
        {items.map((item) => (
          <a className="action-card compact" href={item.href} key={item.label}>
            {item.kind === "csv" ? <Download size={18} /> : <FileText size={18} />}
            <div>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function exportItems(role: UserRole) {
  const finance = [
    {
      description: "Open advances, settlements, and balances.",
      href: "/api/v1/finance/reports/imprest",
      kind: "csv",
      label: "Imprest ledger CSV"
    },
    {
      description: "Billable and recovered B2C claim lines.",
      href: "/api/v1/finance/reports/billable",
      kind: "csv",
      label: "Billable recovery CSV"
    }
  ] as const;

  if (["Finance", "Admin", "MD"].includes(role)) return finance;
  if (role === "BillingTeam") return finance.slice(1);
  if (role === "Auditor") {
    return [{
      description: "Use Audit Review export for filtered evidence and action history.",
      href: "/audit",
      kind: "pdf",
      label: "Audit evidence workspace"
    }] as const;
  }
  return [];
}
