import { describe, expect, it, vi } from "vitest";
import type { NotificationOutboxItem, UserContext } from "../src/server/domain/types";
import type { ClaimRepository } from "../src/server/repositories/claim-repository";
import { AdminService } from "../src/server/services/admin-service";
import { isValidSenderAddress, NotificationService } from "../src/server/services/notification-service";
import { cleanupStaleRecordsSchema } from "../src/server/validation/claim.schemas";

vi.mock("../src/server/config/secrets", () => ({
  getOptionalSecret: vi.fn(async (name: string) => name === "RESEND_API_KEY" ? "test-key" : "finance@example.com")
}));

const adminUser: UserContext = {
  userId: "admin-1",
  role: "Admin",
  correlationId: "test-correlation"
};

function notification(index: number): NotificationOutboxItem {
  return {
    notificationId: `notification-${index}`,
    recipientEmployeeId: "claimant-1",
    recipientEmail: "claimant@example.com",
    subject: `Notification ${index}`,
    body: "Test body",
    relatedClaimId: null,
    status: "Queued",
    deliveryAttempts: 0,
    lastAttemptAt: null,
    lastError: null,
    providerMessageId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    sentAt: null
  };
}

describe("P2 retention cleanup", () => {
  it("rejects unsafe cleanup windows", () => {
    expect(() => cleanupStaleRecordsSchema.parse({ olderThanDays: 7 })).toThrow();
    expect(cleanupStaleRecordsSchema.parse({ olderThanDays: 90 })).toEqual({ olderThanDays: 90 });
  });

  it("reports exactly what the repository removed", async () => {
    const claims = {
      cleanupStaleRecords: vi.fn().mockResolvedValue({
        staleDraftsRemoved: 2,
        exhaustedNotificationsRemoved: 3
      })
    } as unknown as ClaimRepository;
    const service = new AdminService(claims, {} as NotificationService);

    const result = await service.cleanupStaleRecords({ olderThanDays: 90 }, adminUser);

    expect(result.message).toContain("Removed 2 stale draft(s) and 3 exhausted failed notification(s)");
    expect(claims.cleanupStaleRecords).toHaveBeenCalledOnce();
  });
});

describe("P2 notification delivery", () => {
  it("validates Resend from sender format before delivery", () => {
    expect(isValidSenderAddress("claims@send.nimbusharbor.in")).toBe(true);
    expect(isValidSenderAddress("Nimbus Claims <claims@send.nimbusharbor.in>")).toBe(true);
    expect(isValidSenderAddress("send.nimbusharbor.in")).toBe(false);
    expect(isValidSenderAddress("claims@send")).toBe(false);
  });

  it("delivers retry candidates in bounded concurrent batches", async () => {
    const items = Array.from({ length: 7 }, (_, index) => notification(index));
    const claims = {
      listNotifications: vi.fn().mockImplementation(async (status: string) => status === "Queued" ? items : []),
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined)
    } as unknown as ClaimRepository;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "provider-id" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new NotificationService(claims);

    const result = await service.deliverQueued(adminUser);

    expect(result).toEqual({ attempted: 7, sent: 7, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(claims.markNotificationSent).toHaveBeenCalledTimes(7);
    vi.unstubAllGlobals();
  });

  it("reports delivery configuration health without exposing the API key", async () => {
    const claims = {
      listNotifications: vi.fn().mockResolvedValue([])
    } as unknown as ClaimRepository;
    const service = new NotificationService(claims);

    const result = await service.listNotifications(adminUser);

    expect(result.deliveryHealth).toEqual({
      apiKeyConfigured: true,
      fromEmailConfigured: true,
      fromEmail: "finance@example.com",
      status: "Ready",
      guidance: expect.stringContaining("Email provider credentials are configured")
    });
    expect(JSON.stringify(result)).not.toContain("test-key");
  });

  it("flags the Resend testing sender as restricted", async () => {
    const secrets = await import("../src/server/config/secrets");
    vi.mocked(secrets.getOptionalSecret).mockImplementationOnce(async () => "test-key");
    vi.mocked(secrets.getOptionalSecret).mockImplementationOnce(async () => "onboarding@resend.dev");
    const claims = {
      listNotifications: vi.fn().mockResolvedValue([])
    } as unknown as ClaimRepository;
    const service = new NotificationService(claims);

    const result = await service.listNotifications(adminUser);

    expect(result.deliveryHealth.status).toBe("Restricted");
    expect(result.deliveryHealth.guidance).toContain("resend.dev sender is for testing");
  });

  it("flags an invalid sender and fails before calling Resend", async () => {
    const secrets = await import("../src/server/config/secrets");
    vi.mocked(secrets.getOptionalSecret).mockImplementation(async (name: string) => name === "RESEND_API_KEY" ? "test-key" : "send.nimbusharbor.in");
    const claims = {
      listNotifications: vi.fn().mockImplementation(async (status: string) => status === "Queued" || status === "All" ? [notification(1)] : []),
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined)
    } as unknown as ClaimRepository;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new NotificationService(claims);

    const health = await service.listNotifications(adminUser);
    const result = await service.deliverQueued(adminUser);

    expect(health.deliveryHealth.status).toBe("Invalid");
    expect(health.deliveryHealth.guidance).toContain("full sender address");
    expect(result).toEqual({ attempted: 1, sent: 0, failed: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(claims.markNotificationFailed).toHaveBeenCalledWith(
      "notification-1",
      expect.stringContaining("Notification-FromEmail is invalid")
    );
    vi.unstubAllGlobals();
  });
});
