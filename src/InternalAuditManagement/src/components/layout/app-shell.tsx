import Link from "next/link";
import { BarChart3, ClipboardCheck, FileText, Link2, ReceiptText, ShieldCheck } from "lucide-react";
import type { UserRole } from "@/server/domain/types";

type NavLink = {
  href: string;
  label: string;
  icon: typeof BarChart3;
  allowedRoles?: UserRole[];
};

const links: NavLink[] = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/dashboard", label: "MIS Dashboard", icon: ClipboardCheck },
  { href: "/claims/new", label: "New Claim", icon: ReceiptText, allowedRoles: ["Claimant", "HOD"] satisfies UserRole[] },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck, allowedRoles: ["HOD", "MD"] satisfies UserRole[] },
  { href: "/finance", label: "Finance Queue", icon: FileText, allowedRoles: ["Finance", "FinanceHOD"] satisfies UserRole[] },
  { href: "/billing", label: "Billing Alerts", icon: Link2, allowedRoles: ["BillingTeam", "Finance", "FinanceHOD"] satisfies UserRole[] },
  { href: "/audit", label: "Audit Review", icon: ShieldCheck, allowedRoles: ["Finance", "FinanceHOD", "MD"] satisfies UserRole[] }
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentRole = (process.env.DEV_USER_ROLE ?? "Claimant") as UserRole;
  const visibleLinks = links.filter((link) => !link.allowedRoles || link.allowedRoles.includes(currentRole));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Facility Control</strong>
          <span>Expense, billing, and audit workflow</span>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link href={link.href} key={link.href}>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Icon size={16} aria-hidden="true" />
                  {link.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
