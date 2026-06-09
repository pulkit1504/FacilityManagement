import { conflict, forbidden, notFound } from "../errors/application-error";
import type { UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { LinkInvoiceInput } from "../validation/claim.schemas";

export class BillingService {
  constructor(private readonly claims: ClaimRepository) {}

  async listAlerts(user: UserContext, isResolved = false) {
    this.assertBillingAccess(user);
    const items = await this.claims.listBillingAlerts(isResolved);
    return {
      items,
      nextCursor: null,
      totalCount: items.length
    };
  }

  async linkInvoice(alertId: string, input: LinkInvoiceInput, user: UserContext) {
    this.assertBillingAccess(user);

    const alert = await this.claims.getBillingAlert(alertId);
    if (!alert) throw notFound("Billing alert was not found.");
    if (alert.isResolved) throw conflict("This billing alert is already resolved.");

    const resolved = await this.claims.linkInvoiceToBillingAlert(alertId, input.clientInvoiceNumber, user.userId);
    await this.claims.appendAuditLog({
      claimId: resolved.claimId,
      actorUserId: user.userId,
      actionType: "INVOICE_LINKED",
      preActionStatus: "PendingBilling",
      postActionStatus: "AlreadyBilled",
      auditRemarks: `Invoice ${input.clientInvoiceNumber} linked to pending billing item ${resolved.lineItemId}`,
      correlationId: user.correlationId
    });

    return {
      alertId: resolved.alertId,
      clientInvoiceNumber: input.clientInvoiceNumber,
      invoiceValidationStatus: "Valid",
      message: "Invoice linked. Billing alert resolved."
    };
  }

  private assertBillingAccess(user: UserContext) {
    if (!["BillingTeam", "Finance"].includes(user.role)) {
      throw forbidden("Only Billing or Finance users can access billing alerts.");
    }
  }
}
