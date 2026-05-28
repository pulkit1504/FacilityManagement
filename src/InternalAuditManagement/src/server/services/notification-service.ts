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
    await this.deliverOne(notification);
    return notification;
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
    for (const notification of candidates) {
      const delivered = await this.deliverOne(notification);
      if (delivered) {
        result.sent += 1;
      } else {
        result.failed += 1;
      }
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.to],
      subject: input.subject,
      text: input.text
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
