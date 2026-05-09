/**
 * BlobStore abstraction for encrypted blob I/O.
 *
 * Driver is selected by the BLOB_STORE env var:
 *   BLOB_STORE=fs   (default) — local filesystem, for dev and single-server deploys
 *   BLOB_STORE=s3           — AWS S3 or any S3-compatible store (R2, MinIO, etc.)
 */
import { createFsBlobStore } from "./fs-blob";
import { createS3BlobStore } from "./s3-blob";

export interface BlobStore {
  read(id: string): Promise<Buffer | null>;
  write(id: string, data: Buffer): Promise<void>;
}

export async function getBlobStore(storageDir: string): Promise<BlobStore> {
  const driver = process.env.BLOB_STORE ?? "fs";

  switch (driver) {
    case "s3": {
      const bucket = process.env.S3_BUCKET;
      if (!bucket) throw new Error("S3_BUCKET env var is required when BLOB_STORE=s3");
      return createS3BlobStore({
        bucket,
        region: process.env.S3_REGION ?? "us-east-1",
        endpoint: process.env.S3_ENDPOINT,         // set for R2 / MinIO
        prefix: process.env.S3_PREFIX ?? "blobs/", // key prefix inside the bucket
      });
    }
    default:
      return createFsBlobStore(storageDir);
  }
}
