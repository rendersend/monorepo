import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type { BlobStore } from "./blob.ts";

interface S3BlobStoreOptions {
  bucket: string;
  region?: string;
  endpoint?: string; // custom endpoint for R2, MinIO, etc.
  prefix?: string;   // key prefix, e.g. "blobs/"
}

export function createS3BlobStore(opts: S3BlobStoreOptions): BlobStore {
  const client = new S3Client({
    region: opts.region ?? "us-east-1",
    ...(opts.endpoint && {
      endpoint: opts.endpoint,
      forcePathStyle: true, // required for MinIO and most S3-compatible stores
    }),
  });

  const key = (id: string) => `${opts.prefix ?? "blobs/"}${id}.bin`;

  return {
    async read(id) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: opts.bucket, Key: key(id) }),
        );
        const chunks: Buffer[] = [];
        for await (const chunk of res.Body as Readable) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
        }
        return Buffer.concat(chunks);
      } catch (err: unknown) {
        const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw err;
      }
    },

    async write(id, data) {
      await client.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: key(id),
          Body: data,
          ContentType: "application/octet-stream",
        }),
      );
    },
  };
}
