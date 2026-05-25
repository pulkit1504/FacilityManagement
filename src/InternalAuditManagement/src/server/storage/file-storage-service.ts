import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} from "@azure/storage-blob";
import { createHash, randomUUID } from "node:crypto";
import { getRequiredSecret } from "../config/secrets";

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

  async uploadReceipt(input: { claimId: string; lineItemId: string; file: File }): Promise<StoredFile> {
    const [client, containerName] = await Promise.all([this.getClient(), this.getContainerName()]);
    const extension = input.file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const storagePath = `${input.claimId}/${input.lineItemId}/${randomUUID()}.${extension}`;
    const bytes = Buffer.from(await input.file.arrayBuffer());
    const contentHash = createHash("sha256").update(bytes).digest("hex");

    const container = client.getContainerClient(containerName);
    await container.createIfNotExists();
    await container.getBlockBlobClient(storagePath).uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: input.file.type }
    });

    return {
      storagePath,
      contentHash,
      fileSizeBytes: bytes.byteLength,
      contentType: input.file.type,
      originalFileName: input.file.name
    };
  }

  async createDownloadUrl(storagePath: string, expiresInMinutes = 15): Promise<string> {
    const [client, containerName, connectionString] = await Promise.all([
      this.getClient(),
      this.getContainerName(),
      getRequiredSecret("AZURE_STORAGE_CONNECTION_STRING")
    ]);
    const accountName = this.extractConnectionStringValue(connectionString, "AccountName");
    const accountKey = this.extractConnectionStringValue(connectionString, "AccountKey");
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresInMinutes * 60_000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: storagePath,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn
      },
      credential
    ).toString();

    return `${client.url}${containerName}/${storagePath}?${sas}`;
  }

  private async getClient() {
    if (!this.client) {
      this.client = BlobServiceClient.fromConnectionString(
        await getRequiredSecret("AZURE_STORAGE_CONNECTION_STRING")
      );
    }

    return this.client;
  }

  private async getContainerName() {
    return getRequiredSecret("AZURE_STORAGE_CONTAINER_NAME");
  }

  private extractConnectionStringValue(connectionString: string, key: string): string {
    const part = connectionString.split(";").find((segment) => segment.startsWith(`${key}=`));
    if (!part) {
      throw new Error(`Azure Storage connection string is missing ${key}.`);
    }
    return part.slice(key.length + 1);
  }
}
