/**
 * Supabase-backed DataStore implementation.
 * 
 * This implementation uses Supabase as the database backend instead of SQLite.
 * All the same DataStore interface methods are implemented.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import type {
  CreateShareInput,
  DataStore,
  PasskeyCredential,
  RecoveryCode,
  Session,
  Share,
  User,
} from './types.ts';

export function createSupabaseStore(config: {
  url: string;
  serviceRoleKey: string;
}): DataStore {
  const supabase: SupabaseClient = createClient(config.url, config.serviceRoleKey);

  // Helper functions to convert between DB and app formats
  const userFromRow = (row: any): User => ({
    email: row.email,
    createdAt: new Date(row.created_at).getTime(),
    hasPasskey: row.has_passkey,
  });

  const passkeyFromRow = (row: any): PasskeyCredential => ({
    credentialId: row.credential_id,
    email: row.email,
    publicKey: new Uint8Array(row.public_key),
    counter: row.counter,
    transports: row.transports ? JSON.parse(row.transports) : null,
    deviceLabel: row.device_label,
    createdAt: new Date(row.created_at).getTime(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).getTime() : null,
  });

  const recoveryFromRow = (row: any): RecoveryCode => ({
    email: row.email,
    codeHash: row.code_hash,
    createdAt: new Date(row.created_at).getTime(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at).getTime() : null,
  });

  const shareFromRow = (row: any): Share => ({
    id: row.id,
    ownerEmail: row.owner_email,
    recipientEmails: row.recipient_emails ? row.recipient_emails.split(',') : null,
    byteLength: row.byte_length,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).getTime() : null,
    viewCount: row.view_count || 0,
    firstViewedAt: row.first_viewed_at ? new Date(row.first_viewed_at).getTime() : null,
    lastViewedAt: row.last_viewed_at ? new Date(row.last_viewed_at).getTime() : null,
  });

  const sessionFromRow = (row: any): Session => ({
    token: row.token,
    email: row.email,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
  });

  return {
    users: {
      async upsertAnonymous(email: string, when: number): Promise<User> {
        const { data, error } = await supabase
          .from('users')
          .upsert({
            email,
            created_at: new Date(when).toISOString(),
            has_passkey: false,
          })
          .select()
          .single();

        if (error) throw error;
        return userFromRow(data);
      },

      async get(email: string): Promise<User | null> {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (error || !data) return null;
        return userFromRow(data);
      },

      async setHasPasskey(email: string, hasPasskey: boolean): Promise<void> {
        const { error } = await supabase
          .from('users')
          .update({ has_passkey: hasPasskey })
          .eq('email', email);

        if (error) throw error;
      },
    },

    passkeys: {
      async insert(cred: PasskeyCredential): Promise<void> {
        const { error } = await supabase
          .from('passkey_credentials')
          .insert({
            credential_id: cred.credentialId,
            email: cred.email,
            public_key: Array.from(cred.publicKey),
            counter: cred.counter,
            transports: cred.transports ? JSON.stringify(cred.transports) : null,
            device_label: cred.deviceLabel,
            created_at: new Date(cred.createdAt).toISOString(),
            last_used_at: cred.lastUsedAt ? new Date(cred.lastUsedAt).toISOString() : null,
          });

        if (error) throw error;
      },

      async getByCredentialId(credentialId: string): Promise<PasskeyCredential | null> {
        const { data, error } = await supabase
          .from('passkey_credentials')
          .select('*')
          .eq('credential_id', credentialId)
          .single();

        if (error || !data) return null;
        return passkeyFromRow(data);
      },

      async listByEmail(email: string): Promise<PasskeyCredential[]> {
        const { data, error } = await supabase
          .from('passkey_credentials')
          .select('*')
          .eq('email', email)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data.map(passkeyFromRow);
      },

      async updateCounter(credentialId: string, counter: number, lastUsedAt: number): Promise<void> {
        const { error } = await supabase
          .from('passkey_credentials')
          .update({
            counter,
            last_used_at: new Date(lastUsedAt).toISOString(),
          })
          .eq('credential_id', credentialId);

        if (error) throw error;
      },

      async delete(credentialId: string): Promise<void> {
        const { error } = await supabase
          .from('passkey_credentials')
          .delete()
          .eq('credential_id', credentialId);

        if (error) throw error;
      },
    },

    recoveryCodes: {
      async set(email: string, codeHash: string, when: number): Promise<void> {
        const { error } = await supabase
          .from('recovery_codes')
          .upsert({
            email,
            code_hash: codeHash,
            created_at: new Date(when).toISOString(),
            consumed_at: null,
          });

        if (error) throw error;
      },

      async get(email: string): Promise<RecoveryCode | null> {
        const { data, error } = await supabase
          .from('recovery_codes')
          .select('*')
          .eq('email', email)
          .single();

        if (error || !data) return null;
        return recoveryFromRow(data);
      },

      async consume(email: string, when: number): Promise<void> {
        const { error } = await supabase
          .from('recovery_codes')
          .update({
            consumed_at: new Date(when).toISOString(),
          })
          .eq('email', email)
          .is('consumed_at', null);

        if (error) throw error;
      },
    },

    shares: {
      async create(input: CreateShareInput, when: number): Promise<Share> {
        const { data, error } = await supabase
          .from('shares')
          .insert({
            id: input.id,
            owner_email: input.ownerEmail,
            recipient_emails: input.recipientEmails?.join(',') || null,
            byte_length: input.byteLength,
            created_at: new Date(when).toISOString(),
            expires_at: new Date(input.expiresAt).toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return shareFromRow(data);
      },

      async get(id: string): Promise<Share | null> {
        const { data, error } = await supabase
          .from('shares')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !data) return null;
        return shareFromRow(data);
      },

      async countByOwner(email: string): Promise<number> {
        const { count, error } = await supabase
          .from('shares')
          .select('*', { count: 'exact', head: true })
          .eq('owner_email', email);

        if (error) throw error;
        return count || 0;
      },

      async listByOwner(email: string, opts?: { limit?: number }): Promise<Share[]> {
        let query = supabase
          .from('shares')
          .select('*')
          .eq('owner_email', email)
          .order('created_at', { ascending: false });

        if (opts?.limit) {
          query = query.limit(opts.limit);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data.map(shareFromRow);
      },

      async recordView(id: string, when: number): Promise<void> {
        const { error } = await supabase.rpc('record_share_view', {
          share_id: id,
          view_time: new Date(when).toISOString(),
        });

        if (error) {
          // Fallback to manual update if RPC doesn't exist
          const { data: share } = await supabase
            .from('shares')
            .select('view_count, first_viewed_at')
            .eq('id', id)
            .single();

          if (share) {
            await supabase
              .from('shares')
              .update({
                view_count: (share.view_count || 0) + 1,
                first_viewed_at: share.first_viewed_at || new Date(when).toISOString(),
                last_viewed_at: new Date(when).toISOString(),
              })
              .eq('id', id);
          }
        }
      },

      async revoke(id: string, when: number): Promise<void> {
        const { error } = await supabase
          .from('shares')
          .update({
            revoked_at: new Date(when).toISOString(),
          })
          .eq('id', id)
          .is('revoked_at', null);

        if (error) throw error;
      },
    },

    sessions: {
      async create(email: string, ttlMs: number, now: number): Promise<Session> {
        const token = randomBytes(32).toString('base64url');
        const expiresAt = now + ttlMs;

        const { data, error } = await supabase
          .from('sessions')
          .insert({
            token,
            email,
            created_at: new Date(now).toISOString(),
            expires_at: new Date(expiresAt).toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return sessionFromRow(data);
      },

      async get(token: string): Promise<Session | null> {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('token', token)
          .single();

        if (error || !data) return null;
        return sessionFromRow(data);
      },

      async delete(token: string): Promise<void> {
        const { error } = await supabase
          .from('sessions')
          .delete()
          .eq('token', token);

        if (error) throw error;
      },

      async deleteExpired(now: number): Promise<number> {
        const { count, error } = await supabase
          .from('sessions')
          .delete({ count: 'exact' })
          .lt('expires_at', new Date(now).toISOString());

        if (error) throw error;
        return count || 0;
      },
    },

    verifyAttempts: {
      async record(shareId: string, ip: string, when: number): Promise<void> {
        const { error } = await supabase
          .from('verify_attempts')
          .insert({
            share_id: shareId,
            ip,
            attempted_at: new Date(when).toISOString(),
          });

        if (error) throw error;
      },

      async countRecent(shareId: string, sinceTimestamp: number): Promise<number> {
        const { count, error } = await supabase
          .from('verify_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('share_id', shareId)
          .gte('attempted_at', new Date(sinceTimestamp).toISOString());

        if (error) throw error;
        return count || 0;
      },
    },

    close() {
      // Supabase client doesn't need explicit closing
    },
  };
}
