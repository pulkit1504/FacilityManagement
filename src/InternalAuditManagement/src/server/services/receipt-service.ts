import { conflict, forbidden, notFound } from "../errors/application-error";
import type { UserContext } from "../domain/types";
import type { ClaimRepository } from "../repositories/claim-repository";
import type { FileStorageService } from "../storage/file-storage-service";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/heic", "application/pdf"]);
const maxFileSizeBytes = 10 * 1024 * 1024;

export class ReceiptService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly files: FileStorageService
  ) {}

  async uploadReceipt(input: { claimId: string; lineItemId: string; file: File }, user: UserContext) {
    this.validateFile(input.file);

    const claim = await this.claims.getClaimDetail(input.claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (claim.submitterEmployeeId !== user.userId && !["Finance", "FinanceHOD"].includes(user.role)) {
      throw forbidden("Only the claimant or Finance can upload receipts for this claim.");
    }

    if (!["Draft", "Submitted", "HodApproved", "MdApproved"].includes(claim.status)) {
      throw conflict("Receipts can only be uploaded before payment processing is complete.");
    }

    const lineItem = claim.lineItems.find((item) => item.lineItemId === input.lineItemId);
    if (!lineItem) throw notFound("Line item was not found on this claim.");

    const storedFile = await this.files.uploadReceipt(input);
    const attachment = await this.claims.createAttachment({
      lineItemId: input.lineItemId,
      storagePath: storedFile.storagePath,
      contentHash: storedFile.contentHash,
      originalFileName: storedFile.originalFileName,
      fileSizeBytes: storedFile.fileSizeBytes,
      contentType: storedFile.contentType,
      uploadedByUserId: user.userId
    });

    await Promise.all([
      this.claims.clearMissingReceiptFlag(input.lineItemId),
      this.claims.appendAuditLog({
        claimId: input.claimId,
        actorUserId: user.userId,
        actionType: "RECEIPT_UPLOADED",
        preActionStatus: claim.status,
        postActionStatus: claim.status,
        auditRemarks: `Receipt uploaded for line item ${input.lineItemId}`,
        correlationId: user.correlationId
      })
    ]);

    return {
      attachmentId: attachment.attachmentId,
      originalFileName: attachment.originalFileName,
      fileSizeBytes: attachment.fileSizeBytes,
      contentHash: attachment.contentHash,
      message: "Receipt attached."
    };
  }

  async createDownloadUrl(input: { claimId: string; lineItemId: string; attachmentId: string }, user: UserContext) {
    const claim = await this.claims.getClaimDetail(input.claimId);
    if (!claim) throw notFound("Claim was not found.");

    if (claim.submitterEmployeeId !== user.userId && !["HOD", "MD", "Finance", "FinanceHOD"].includes(user.role)) {
      throw forbidden("You do not have access to this receipt.");
    }

    const lineItem = claim.lineItems.find((item) => item.lineItemId === input.lineItemId);
    if (!lineItem) throw notFound("Line item was not found on this claim.");

    const attachment = lineItem.attachments.find((item) => item.attachmentId === input.attachmentId)
      ?? (await this.claims.getAttachment(input.attachmentId));

    if (!attachment || attachment.lineItemId !== input.lineItemId) {
      throw notFound("Attachment was not found on this line item.");
    }

    const downloadUrl = await this.files.createDownloadUrl(attachment.storagePath, 15);

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      originalFileName: attachment.originalFileName
    };
  }

  private validateFile(file: File) {
    if (!allowedContentTypes.has(file.type)) {
      throw conflict("Only JPEG, PNG, HEIC, or PDF receipts are allowed.");
    }

    if (file.size <= 0 || file.size > maxFileSizeBytes) {
      throw conflict("Receipt file size must be greater than 0 and no more than 10 MB.");
    }
  }
}
