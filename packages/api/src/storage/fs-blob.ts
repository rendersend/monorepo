import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BlobStore } from "./blob.ts";

export async function createFsBlobStore(storageDir: string): Promise<BlobStore> {
  const blobsDir = join(storageDir, "blobs");
  await mkdir(blobsDir, { recursive: true });

  return {
    async read(id) {
      try {
        return await readFile(join(blobsDir, `${id}.bin`));
      } catch {
        return null;
      }
    },
    async write(id, data) {
      await writeFile(join(blobsDir, `${id}.bin`), data);
    },
  };
}
