import type { UserRole } from "../domain/types";

export type TestUser = {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
};

export const testUserCookieName = "fm_test_user";

export const testUsers = [
  {
    userId: "emp-admin-001",
    role: "Admin",
    name: "System Admin",
    email: "admin@example.com"
  },
  {
    userId: "emp-claimant-001",
    role: "Claimant",
    name: "Site Supervisor",
    email: "claimant@example.com"
  },
  {
    userId: "emp-hod-001",
    role: "HOD",
    name: "Operations HOD",
    email: "hod@example.com"
  },
  {
    userId: "emp-md-001",
    role: "MD",
    name: "Managing Director",
    email: "md@example.com"
  },
  {
    userId: "emp-finance-001",
    role: "Finance",
    name: "Finance User",
    email: "finance@example.com"
  },
  {
    userId: "emp-finance-001",
    role: "FinanceHOD",
    name: "Finance HOD",
    email: "financehod@example.com"
  },
  {
    userId: "emp-billing-001",
    role: "BillingTeam",
    name: "Billing User",
    email: "billing@example.com"
  }
] satisfies TestUser[];

export function findTestUser(userId: string, role: string) {
  return testUsers.find((user) => user.userId === userId && user.role === role) ?? null;
}

export function parseTestUserCookie(value: string | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<TestUser>;
    if (!parsed.userId || !parsed.role) return null;
    return findTestUser(parsed.userId, parsed.role);
  } catch {
    return null;
  }
}

export function serializeTestUserCookie(user: TestUser) {
  return Buffer.from(JSON.stringify({ userId: user.userId, role: user.role }), "utf8").toString("base64url");
}
