import "server-only";
import { cookies } from "next/headers";
import { validateSessionToken, SESSION_COOKIE, WORKSPACE_COOKIE } from "./session";
import { resolveWorkspace } from "./context";

/** Session lookup for server components / layouts (reads request cookies). */
export async function getServerAuth() {
  const jar = cookies();
  const auth = await validateSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!auth) return null;
  const resolved = await resolveWorkspace(auth.user, jar.get(WORKSPACE_COOKIE)?.value ?? null);
  return { ...auth, workspace: resolved?.workspace ?? null, member: resolved?.member ?? null };
}
