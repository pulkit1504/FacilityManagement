import Link from "next/link";
import { BarChart3, ClipboardCheck, FileText, ReceiptText, ShieldCheck } from "lucide-react";

const links = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/dashboard", label: "MIS Dashboard", icon: ClipboardCheck },
  { href: "/claims/new", label: "New Claim", icon: ReceiptText },
  { href: "/finance", label: "Finance Queue", icon: FileText },
  { href: "/audit", label: "Audit Review", icon: ShieldCheck }
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Facility Control</strong>
          <span>Expense, billing, and audit workflow</span>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {links.map((link) => {
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
