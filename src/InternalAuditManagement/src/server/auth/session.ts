import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserContext, UserRole } from "../domain/types";

export const authSessionCookieName = "fm_session";

type SessionPayload = {
  userId: string;
  role: UserRole;
  email?: string;
  name?: string;
  expiresAt: number;
};

export type AuthSession = Omit<SessionPayload, "expiresAt"> & {
  expiresAt: Date;
};

export function createSessionCookieValue(session: Omit<AuthSession, "expiresAt">, maxAgeSeconds: number) {
  const payload: SessionPayload = {
    ...session,
    expiresAt: Math.floor(Date.now() / 1000) + maxAgeSeconds
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function parseSessionCookie(value: string | undefined): AuthSession | null {
  if (!value) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature || !isValidSignature(encodedPayload, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (!payload.userId || !payload.role || !payload.expiresAt || payload.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: payload.userId,
      role: payload.role,
      email: payload.email,
      name: payload.name,
      expiresAt: new Date(payload.expiresAt * 1000)
    };
  } catch {
    return null;
  }
}

export function sessionToUserContext(session: AuthSession, correlationId: string): UserContext {
  return {
    userId: session.userId,
    role: session.role,
    email: session.email,
    name: session.name,
    correlationId
  };
}

export function assertSessionSecretConfigured() {
  getSessionSecret();
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function isValidSignature(payload: string, signature: string) {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be configured with at least 32 characters.");
  }

  return secret;
}
