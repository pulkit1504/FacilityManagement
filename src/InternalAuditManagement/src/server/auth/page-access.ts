import { redirect } from "next/navigation";
import { getUserContext } from "./user-context";
import type { UserContext, UserRole } from "../domain/types";

export async function requirePageAccess(allowedRoles?: UserRole[]): Promise<UserContext> {
  let user: UserContext;

  try {
    user = await getUserContext();
  } catch {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return user;
  }

  return user;
}

export function canAccessPage(user: UserContext, allowedRoles?: UserRole[]) {
  return !allowedRoles || allowedRoles.includes(user.role);
}
