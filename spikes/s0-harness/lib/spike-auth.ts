import type { Session } from "next-auth";

export type SpikeMockRole = "host" | "guest";

declare module "next-auth" {
  interface Session {
    mockRole: SpikeMockRole;
  }
}

export function parseAllowlistEmails(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const allowlist = parseAllowlistEmails(process.env.ALLOWLIST_EMAILS);
  if (allowlist.size > 0 && allowlist.has(normalized)) {
    return true;
  }
  const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  if (domain && normalized.endsWith(`@${domain}`)) {
    return true;
  }
  // Spike dev convenience: if no allowlist configured, allow any Google account
  if (allowlist.size === 0 && !domain) {
    return true;
  }
  return false;
}

export function resolveMockRole(email: string): SpikeMockRole {
  const byEmailRaw = process.env.SPIKE_ROLE_BY_EMAIL;
  if (byEmailRaw) {
    try {
      const map = JSON.parse(byEmailRaw) as Record<string, string>;
      const role = map[email.trim().toLowerCase()] ?? map[email];
      if (role === "host" || role === "guest") {
        return role;
      }
    } catch {
      // ignore invalid JSON in spike harness
    }
  }
  const fallback = process.env.SPIKE_MOCK_ROLE?.trim().toLowerCase();
  if (fallback === "guest") {
    return "guest";
  }
  return "host";
}

export function sessionMockRole(session: Session | null): SpikeMockRole | null {
  return session?.mockRole ?? null;
}
