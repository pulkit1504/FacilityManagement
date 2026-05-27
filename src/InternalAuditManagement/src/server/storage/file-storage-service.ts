import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} from "@azure/storage-blob";
import { createHash, randomUUID } from "node:crypto";
import { getRequiredSecret } from "../config/secrets";
import { timeAsync } from "../observability/performance";

const receiptsContainerName = "nimbus";

export type StoredFile = {
  storagePath: string;
  contentHash: string;
  fileSizeBytes: number;
  contentType: string;
  originalFileName: string;
};

export interface FileStorageService {
  uploadReceipt(input: {
    claimId: string;
    lineItemId: string;
    file: File;
  }): Promise<StoredFile>;
  createDownloadUrl(storagePath: string, expiresInMinutes?: number): Promise<string>;
}

export class AzureBlobFileStorageService implements FileStorageService {
  private client: BlobServiceClient | null = null;
  private clientPromise: Promise<BlobServiceClient> | null = null;
  private containerReadyPromise: Promise<unknown> | null = null;

  async uploadReceipt(input: { claimId: string; lineItemId: string; file: File }): Promise<StoredFile> {
    const client = await this.getClient();
    const extension = input.file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const storagePath = `${input.claimId}/${input.lineItemId}/${randomUUID()}.${extension}`;
    const bytes = Buffer.from(
      await timeAsync("blob.receipt.readFormFile", () => input.file.arrayBuffer(), {
        fileSizeBytes: input.file.size,
        contentType: input.file.type
      })
    );
    const contentHash = createHash("sha256").update(bytes).digest("hex");

    const container = await this.getReceiptsContainer(client);
    await timeAsync(
      "blob.receipt.upload",
      () =>
        container.getBlockBlobClient(storagePath).uploadData(bytes, {
          blobHTTPHeaders: { blobContentType: input.file.type }
        }),
      {
        containerName: receiptsContainerName,
        fileSizeBytes: bytes.byteLength,
        contentType: input.file.type
      }
    );

    return {
      storagePath,
      contentHash,
      fileSizeBytes: bytes.byteLength,
      contentType: input.file.type,
      originalFileName: input.file.name
    };
  }

  async createDownloadUrl(storagePath: string, expiresInMinutes = 15): Promise<string> {
    return timeAsync(
      "blob.receipt.createDownloadUrl",
      async () => {
        const [client, connectionString] = await Promise.all([
          this.getClient(),
          getRequiredSecret("AZURE_STORAGE_CONNECTION_STRING")
        ]);
        const accountName = this.extractConnectionStringValue(connectionString, "AccountName");
        const accountKey = this.extractConnectionStringValue(connectionString, "AccountKey");
        const credential = new StorageSharedKeyCredential(accountName, accountKey);
        const startsOn = new Date();
        const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60_000);
        const sas = generateBlobSASQueryParameters(
          {
            containerName: receiptsContainerName,
            blobName: storagePath,
            permissions: BlobSASPermissions.parse("r"),
            startsOn,
            expiresOn
          },
          credential
        ).toString();

        return `${client.url}${receiptsContainerName}/${storagePath}?${sas}`;
      },
      { containerName: receiptsContainerName, expiresInMinutes }
    );
  }

  private async getClient() {
    if (!this.client) {
      this.clientPromise ??= timeAsync(
        "blob.client.create",
        async () => BlobServiceClient.fromConnectionString(await getRequiredSecret("AZURE_STORAGE_CONNECTION_STRING"))
      );
      try {
        this.client = await this.clientPromise;
      } catch (error) {
        this.clientPromise = null;
        throw error;
      }
    }

    return this.client;
  }

  private async getReceiptsContainer(client: BlobServiceClient) {
    const container = client.getContainerClient(receiptsContainerName);
    this.containerReadyPromise ??= timeAsync("blob.container.createIfNotExists", () => container.createIfNotExists(), {
      containerName: receiptsContainerName
    });
    try {
      await this.containerReadyPromise;
    } catch (error) {
      this.containerReadyPromise = null;
      throw error;
    }
    return container;
  }

  private extractConnectionStringValue(connectionString: string, key: string): string {
    const part = connectionString.split(";").find((segment) => segment.startsWith(`${key}=`));
    if (!part) {
      throw new Error(`Azure Storage connection string is missing ${key}.`);
    }
    return part.slice(key.length + 1);
  }
}
