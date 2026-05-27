import type { UserRole } from "@/server/domain/types";
import { PrimaryNav } from "./primary-nav";
import { cookies } from "next/headers";
import { CurrentTestUser } from "@/components/auth/current-test-user";
import { parseTestUserCookie, testUserCookieName } from "@/server/auth/test-users";

type NavLink = {
  href: string;
  label: string;
  icon: "BarChart3" | "ClipboardCheck" | "FileText" | "Link2" | "ReceiptText" | "ShieldCheck";
  exact?: boolean;
  allowedRoles?: UserRole[];
};

const links: NavLink[] = [
  { href: "/", label: "Overview", icon: "BarChart3" },
  { href: "/dashboard", label: "MIS Dashboard", icon: "ClipboardCheck" },
  { href: "/claims", label: "My Claims", icon: "FileText", exact: true, allowedRoles: ["Claimant", "HOD"] satisfies UserRole[] },
  { href: "/claims/new", label: "New Claim", icon: "ReceiptText", allowedRoles: ["Claimant", "HOD"] satisfies UserRole[] },
  { href: "/approvals", label: "Approvals", icon: "ClipboardCheck", allowedRoles: ["HOD", "MD"] satisfies UserRole[] },
  { href: "/finance", label: "Finance Queue", icon: "FileText", allowedRoles: ["Finance", "FinanceHOD"] satisfies UserRole[] },
  { href: "/billing", label: "Billing Alerts", icon: "Link2", allowedRoles: ["BillingTeam", "Finance", "FinanceHOD"] satisfies UserRole[] },
  { href: "/audit", label: "Audit Review", icon: "ShieldCheck", allowedRoles: ["Finance", "FinanceHOD", "MD"] satisfies UserRole[] }
];

export async function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const testUser = parseTestUserCookie(cookieStore.get(testUserCookieName)?.value);
  const currentRole = testUser?.role ?? ((process.env.DEV_USER_ROLE ?? "Claimant") as UserRole);
  const visibleLinks = links.filter((link) => !link.allowedRoles || link.allowedRoles.includes(currentRole));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Facility Control</strong>
          <span>Expense, billing, and audit workflow</span>
        </div>
        <CurrentTestUser name={testUser?.name ?? "Development User"} role={currentRole} />
        <PrimaryNav links={visibleLinks} />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
