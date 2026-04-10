import { ScopeType } from "@prisma/client";
import { headers } from "next/headers";
import { auth } from "@/core/auth/auth";

export type BetterSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export type AccessContext = {
  type: ScopeType;
  id: string;
};

export async function authHeaders(): Promise<Headers> {
  return new Headers(await headers());
}

export async function getServerSessionOrNull(): Promise<BetterSession> {
  return auth.api.getSession({
    headers: await authHeaders(),
  });
}

export async function requireServerSession() {
  const session = await getServerSessionOrNull();

  if (!session) {
    throw new Error("UNAUTHORIZED");
  }

  return session;
}

export function resolveActiveContext(
  session: BetterSession,
  fallbackUserId?: string,
): AccessContext | null {
  if (!session) {
    return null;
  }

  const rawSession = session.session as {
    activeContextType?: string | null;
    activeContextId?: string | null;
  };

  const hasContext = rawSession.activeContextType && rawSession.activeContextId;
  if (!hasContext) {
    const personalId = fallbackUserId ?? session.user.id;
    return {
      type: ScopeType.PERSONAL,
      id: personalId,
    };
  }

  const validTypes = new Set(Object.values(ScopeType));
  const candidateType = rawSession.activeContextType ?? "";
  if (!validTypes.has(candidateType as ScopeType)) {
    return {
      type: ScopeType.PERSONAL,
      id: fallbackUserId ?? session.user.id,
    };
  }

  return {
    type: candidateType as ScopeType,
    id: rawSession.activeContextId!,
  };
}