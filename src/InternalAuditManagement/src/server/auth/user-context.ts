import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { forbidden } from "../errors/application-error";
import { userRoles, type UserContext, type UserRole } from "../domain/types";
import { parseTestUserCookie, testUserCookieName } from "./test-users";

export async function getUserContext(): Promise<UserContext> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const correlationId = headerStore.get("x-correlation-id") ?? randomUUID();
  const testUser = parseTestUserCookie(cookieStore.get(testUserCookieName)?.value);

  if (testUser) {
    return {
      userId: testUser.userId,
      role: testUser.role,
      email: testUser.email,
      name: testUser.name,
      correlationId
    };
  }

  if (process.env.APP_AUTH_MODE === "development") {
    const role = process.env.DEV_USER_ROLE ?? "Claimant";
    if (!userRoles.includes(role as UserRole)) {
      throw forbidden("Invalid development user role configured.");
    }

    return {
      userId: process.env.DEV_USER_ID ?? "emp-claimant-001",
      role: role as UserRole,
      email: "dev@example.com",
      name: "Development User",
      correlationId
    };
  }

  const userId = headerStore.get("x-user-id");
  const role = headerStore.get("x-user-role");

  if (!userId || !role || !userRoles.includes(role as UserRole)) {
    throw forbidden("A valid authenticated user context is required.");
  }

  return {
    userId,
    role: role as UserRole,
    email: headerStore.get("x-user-email") ?? undefined,
    name: headerStore.get("x-user-name") ?? undefined,
    correlationId
  };
}

export function requireRole(user: UserContext, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(user.role)) {
    throw forbidden();
  }
}
