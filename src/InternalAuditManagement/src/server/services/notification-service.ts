import type { NotificationOutboxInput, NotificationOutboxItem, UserContext } from "../domain/types";
import { forbidden } from "../errors/application-error";
import type { ClaimRepository } from "../repositories/claim-repository";
import { getOptionalSecret } from "../config/secrets";

type DeliveryResult = {
  attempted: number;
  sent: number;
  failed: number;
};

export class NotificationService {
  constructor(private readonly claims: ClaimRepository) {}

  async enqueueAndSend(input: NotificationOutboxInput) {
    const notification = await this.claims.enqueueNotification(input);
    const delivered = await this.deliverOne(notification);
    return {
      ...notification,
      status: delivered ? "Sent" as const : "Failed" as const
    };
  }

  async listNotifications(user: UserContext) {
    this.assertAdmin(user);
    const items = await this.claims.listNotifications("All");
    return {
      items,
      totalCount: items.length
    };
  }

  async deliverQueued(user: UserContext): Promise<DeliveryResult> {
    this.assertAdmin(user);
    const queued = await this.claims.listNotifications("Queued");
    const failed = await this.claims.listNotifications("Failed");
    const candidates = [...queued, ...failed].filter((item) => item.deliveryAttempts < 3);

    const result: DeliveryResult = { attempted: candidates.length, sent: 0, failed: 0 };
    for (let index = 0; index < candidates.length; index += 5) {
      const batch = candidates.slice(index, index + 5);
      const outcomes = await Promise.all(batch.map((notification) => this.deliverOne(notification)));
      result.sent += outcomes.filter(Boolean).length;
      result.failed += outcomes.filter((delivered) => !delivered).length;
    }

    return result;
  }

  private async deliverOne(notification: NotificationOutboxItem) {
    try {
      const response = await sendEmail({
        to: notification.recipientEmail,
        subject: notification.subject,
        text: notification.body
      });
      await this.claims.markNotificationSent(notification.notificationId, response.providerMessageId);
      return true;
    } catch (error) {
      try {
        await this.claims.markNotificationFailed(
          notification.notificationId,
          error instanceof Error ? error.message : "Email delivery failed."
        );
      } catch {
        // Notification delivery must never block the claim workflow that created it.
      }
      return false;
    }
  }

  private assertAdmin(user: UserContext) {
    if (user.role !== "Admin") {
      throw forbidden("Only Admin users can inspect or retry notification delivery.");
    }
  }
}

async function sendEmail(input: { to: string; subject: string; text: string }) {
  const [apiKey, fromEmail] = await Promise.all([
    getOptionalSecret("RESEND_API_KEY"),
    getOptionalSecret("NOTIFICATION_FROM_EMAIL")
  ]);

  if (!apiKey || !fromEmail) {
    throw new Error("Email delivery is not configured. Add Resend-ApiKey and Notification-FromEmail secrets.");
  }

  const testRecipient = process.env.APP_AUTH_MODE === "test" ? process.env.NOTIFICATION_TEST_RECIPIENT : undefined;
  const recipient = testRecipient || input.to;
  const text = testRecipient && testRecipient !== input.to
    ? `Test delivery redirected from ${input.to}.\n\n${input.text}`
    : input.text;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject: input.subject,
      text
    })
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `Email provider returned ${response.status}.`);
  }

  return {
    providerMessageId: body.id ?? null
  };
}
