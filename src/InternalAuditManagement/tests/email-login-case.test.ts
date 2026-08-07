import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseClaimRepository } from "../src/server/repositories/supabase-claim-repository";

let employeeRows: Array<Record<string, unknown>> = [];

vi.mock("../src/server/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(async () => false)
}));

vi.mock("@/shared/settlement", () => ({
  calculateSelectedSettlementAmounts: vi.fn(() => ({
    advanceAdjusted: 0,
    finalPayable: 0,
    netAdvanceLeft: 0
  }))
}));

vi.mock("../src/server/repositories/supabase-client", () => ({
  getSupabaseAdminClient: vi.fn(async () => ({
    from: vi.fn(() => employeeQuery())
  }))
}));

function employeeQuery() {
  let emailFilter = "";
  let activeOnly = false;

  const query = {
    select: vi.fn(() => query),
    ilike: vi.fn((column: string, value: string) => {
      if (column === "email") emailFilter = value;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      if (column === "is_active") activeOnly = Boolean(value);
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      const row = employeeRows.find((employee) => {
        const emailMatches = String(employee.email).toLowerCase() === emailFilter.toLowerCase();
        const activeMatches = !activeOnly || employee.is_active === true;
        return emailMatches && activeMatches;
      });
      return { data: row ?? null, error: null };
    })
  };

  return query;
}

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    employee_id: "EMP-001",
    full_name: "Case Test User",
    email: "CASE.USER@NIMBUSHARBOR.COM",
    role: "Claimant",
    direct_manager_id: null,
    is_hod: false,
    approval_threshold_amount: 0,
    imprest_advance_limit: 0,
    bank_account_holder_name: null,
    bank_account_number: null,
    bank_ifsc: null,
    bank_name: null,
    password_reset_required: false,
    password_updated_at: "2026-06-30T00:00:00.000Z",
    is_active: true,
    ...overrides
  };
}

describe("email authentication lookup", () => {
  afterEach(() => {
    delete process.env.AUTH_BOOTSTRAP_EMAIL;
    delete process.env.AUTH_BOOTSTRAP_PASSWORD;
    employeeRows = [];
  });

  it("authenticates when stored email casing differs from login email casing", async () => {
    process.env.AUTH_BOOTSTRAP_EMAIL = "case.user@nimbusharbor.com";
    process.env.AUTH_BOOTSTRAP_PASSWORD = "ValidPass123!";
    employeeRows = [employeeRow()];

    const employee = await new SupabaseClaimRepository().authenticateEmployee(
      "case.user@nimbusharbor.com",
      "ValidPass123!"
    );

    expect(employee).toMatchObject({
      employeeId: "EMP-001",
      email: "CASE.USER@NIMBUSHARBOR.COM"
    });
  });

  it("finds active employees by email case-insensitively", async () => {
    employeeRows = [employeeRow()];

    const employee = await new SupabaseClaimRepository().getEmployeeByEmail("case.user@nimbusharbor.com");

    expect(employee?.employeeId).toBe("EMP-001");
  });
});
