// Node-side session resolution for route handlers and server components. The edge middleware has
// already checked the token's signature + expiry (cheap, no store); this layer re-verifies AND adds
// the checks that need the store: the user still exists, the token's version matches (revocation),
// and the tenant is real. Every scoped API route starts with requireSession().

import { cookies } from "next/headers";
import { AUTH_COOKIE, sessionSecret, verifySession } from "./auth.ts";
import { getTenant, getUserById } from "./store.ts";
import type { Tenant, User } from "./types";

export interface Session {
  user: User;
  tenant: Tenant;
  tid: string; // tenant id — the scoping key every store read/mutation takes
}

/** Resolve the current request's session, or null (route should 401 / page should redirect). */
export async function requireSession(): Promise<Session | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token, sessionSecret());
  if (!payload) return null;
  const user = getUserById(payload.uid);
  if (!user || user.tokenVersion !== payload.ver || user.tenantId !== payload.tid) return null;
  const tenant = getTenant(user.tenantId);
  if (!tenant) return null;
  return { user, tenant, tid: tenant.id };
}
