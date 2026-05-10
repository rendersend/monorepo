import { jwtVerify, createRemoteJWKSet } from "jose";

export const AUTH_MODE = (process.env.AUTH_MODE ?? "none") as "none" | "supabase";

export interface AuthUser {
  id: string;
  email: string;
}

// Lazy-initialised JWKS client — fetched once and cached by jose.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error("SUPABASE_URL is not set");
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

export async function verifyBearerToken(authHeader: string | undefined): Promise<AuthUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwks());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
