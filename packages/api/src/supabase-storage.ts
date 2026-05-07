/**
 * Supabase Storage implementation for encrypted HTML blobs.
 * 
 * This module handles uploading and downloading encrypted blobs
 * to/from Supabase Storage instead of local filesystem.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'rendersend-blobs';

export interface StorageConfig {
  url: string;
  serviceRoleKey: string;
}

export function createSupabaseStorage(config: StorageConfig) {
  const supabase: SupabaseClient = createClient(config.url, config.serviceRoleKey);

  return {
    async uploadBlob(id: string, data: Buffer | Uint8Array): Promise<void> {
      const { error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .upload(`${id}.bin`, data, {
          contentType: 'application/octet-stream',
          upsert: true,
        });

      if (error) {
        throw new Error(`Failed to upload blob: ${error.message}`);
      }
    },

    async downloadBlob(id: string): Promise<Buffer | null> {
      const { data, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .download(`${id}.bin`);

      if (error) {
        if (error.message.includes('Not found') || error.message.includes('not found')) {
          return null;
        }
        throw new Error(`Failed to download blob: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      // Convert Blob to Buffer
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },

    async deleteBlob(id: string): Promise<void> {
      const { error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .remove([`${id}.bin`]);

      if (error) {
        throw new Error(`Failed to delete blob: ${error.message}`);
      }
    },

    async ensureBucket(): Promise<void> {
      // Check if bucket exists
      const { data: buckets, error: listError } = await supabase
        .storage
        .listBuckets();

      if (listError) {
        throw new Error(`Failed to list buckets: ${listError.message}`);
      }

      const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

      if (!bucketExists) {
        // Create the bucket
        const { error: createError } = await supabase
          .storage
          .createBucket(BUCKET_NAME, {
            public: false, // Private bucket - only accessible via service role
            fileSizeLimit: 10485760, // 10MB limit
          });

        if (createError) {
          throw new Error(`Failed to create bucket: ${createError.message}`);
        }

        console.log(`[storage] Created bucket: ${BUCKET_NAME}`);
      }
    },

    getPublicUrl(id: string): string | null {
      const { data } = supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(`${id}.bin`);

      return data?.publicUrl || null;
    },
  };
}

export type SupabaseStorage = ReturnType<typeof createSupabaseStorage>;
