import type { UserRole } from "@/server/domain/types";
import { PrimaryNav } from "./primary-nav";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { CurrentTestUser } from "@/components/auth/current-test-user";
import { CompanyLogo } from "@/components/layout/company-logo";
import { GlobalRecordSearch } from "@/components/layout/global-record-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import { authSessionCookieName, parseSessionCookie } from "@/server/auth/session";
import { parseTestUserCookie, testUserCookieName } from "@/server/auth/test-users";

type NavLink = {
  href: string;
  label: string;
  icon: "BarChart3" | "CircleHelp" | "ClipboardCheck" | "FileText" | "Link2" | "ReceiptText" | "ShieldCheck" | "Settings" | "UserRound";
  exact?: boolean;
  allowedRoles?: UserRole[];
};

const links: NavLink[] = [
  { href: "/", label: "Overview", icon: "BarChart3" },
  { href: "/dashboard", label: "MIS Dashboard", icon: "ClipboardCheck", allowedRoles: ["MD", "Finance", "BillingTeam", "Admin"] satisfies UserRole[] },
  { href: "/claims", label: "My Claims", icon: "FileText", exact: true, allowedRoles: ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[] },
  { href: "/claims/new", label: "New Claim", icon: "ReceiptText", allowedRoles: ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[] },
  { href: "/imprest", label: "Imprest", icon: "ReceiptText", allowedRoles: ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[] },
  { href: "/profile", label: "My Profile", icon: "UserRound", allowedRoles: ["Claimant", "ClusterHead", "HOD"] satisfies UserRole[] },
  { href: "/approvals", label: "Approvals", icon: "ClipboardCheck", allowedRoles: ["ClusterHead", "HOD", "MD"] satisfies UserRole[] },
  { href: "/finance", label: "Finance Queue", icon: "FileText", allowedRoles: ["Finance"] satisfies UserRole[] },
  { href: "/billing", label: "Billing Alerts", icon: "Link2", allowedRoles: ["BillingTeam", "Finance"] satisfies UserRole[] },
  { href: "/audit", label: "Audit Review", icon: "ShieldCheck", allowedRoles: ["Auditor", "MD"] satisfies UserRole[] },
  { href: "/admin", label: "Admin", icon: "Settings", allowedRoles: ["Admin"] satisfies UserRole[] },
  { href: "/help", label: "Help & Tutorial", icon: "CircleHelp" }
];

export async function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const session = parseSessionCookie(cookieStore.get(authSessionCookieName)?.value);
  const testUser = process.env.APP_AUTH_MODE === "test"
    ? parseTestUserCookie(cookieStore.get(testUserCookieName)?.value)
    : null;
  const currentRole = session?.role ?? testUser?.role ?? ((process.env.DEV_USER_ROLE ?? "Claimant") as UserRole);
  const currentName = session?.name ?? testUser?.name ?? "Development User";
  const visibleLinks = links.filter((link) => !link.allowedRoles || link.allowedRoles.includes(currentRole));

  return (
    <div className="shell">
      <aside className="sidebar">
        <CompanyLogo />
        <Suspense fallback={null}>
          <GlobalRecordSearch />
        </Suspense>
        <NotificationBell />
        <CurrentTestUser name={currentName} role={currentRole} />
        <PrimaryNav links={visibleLinks} />
        <a className="designer-credit" href="https://ai.dhanvistar.in" rel="noopener noreferrer" target="_blank">
          Designed by DVC
        </a>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
