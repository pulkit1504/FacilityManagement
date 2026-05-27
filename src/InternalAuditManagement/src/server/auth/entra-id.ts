import "server-only";
import { createHash, createPublicKey, createVerify, randomBytes, randomUUID } from "node:crypto";

export const oauthStateCookieName = "fm_oauth_state";
export const oauthVerifierCookieName = "fm_oauth_verifier";
export const oauthNonceCookieName = "fm_oauth_nonce";

type TokenResponse = {
  id_token?: string;
  error?: string;
  error_description?: string;
};

type JsonWebKeySet = {
  keys: JsonWebKey[];
};

type JsonWebKey = {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
};

export type EntraUserProfile = {
  email: string;
  name?: string;
  subject: string;
};

export function createAuthorizationRequest(origin: string) {
  const state = randomUUID();
  const nonce = randomUUID();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const config = getEntraConfig(origin);
  const url = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { url, state, nonce, verifier };
}

export async function exchangeCodeForProfile(input: {
  origin: string;
  code: string;
  verifier: string;
  nonce: string;
}): Promise<EntraUserProfile> {
  const config = getEntraConfig(input.origin);
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: config.redirectUri,
    code_verifier: input.verifier,
    scope: "openid profile email"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const token = (await response.json()) as TokenResponse;

  if (!response.ok || !token.id_token) {
    throw new Error(token.error_description ?? token.error ?? "Microsoft sign-in failed.");
  }

  await verifyIdentityTokenSignature(token.id_token, config.tenantId);
  const claims = parseJwtPayload(token.id_token);
  validateIdentityClaims(claims, config, input.nonce);
  const email = stringClaim(claims.email) ?? stringClaim(claims.preferred_username) ?? stringClaim(claims.upn);
  if (!email) {
    throw new Error("Microsoft account did not provide an email address.");
  }

  return {
    email,
    name: stringClaim(claims.name) ?? undefined,
    subject: stringClaim(claims.sub) ?? email
  };
}

function parseJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("Microsoft sign-in returned an invalid identity token.");
  }

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

async function verifyIdentityTokenSignature(token: string, tenantId: string) {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Microsoft sign-in returned an invalid identity token.");
  }

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as { kid?: string; alg?: string };
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Microsoft sign-in token used an unsupported signing algorithm.");
  }

  const keys = await getMicrosoftSigningKeys(tenantId);
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    throw new Error("Microsoft sign-in token signing key was not found.");
  }

  const publicKey = createPublicKey({ key, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  if (!verifier.verify(publicKey, Buffer.from(signature, "base64url"))) {
    throw new Error("Microsoft sign-in token signature could not be verified.");
  }
}

async function getMicrosoftSigningKeys(tenantId: string) {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`, {
    next: { revalidate: 60 * 60 }
  });
  if (!response.ok) {
    throw new Error("Could not load Microsoft sign-in keys.");
  }

  const jwks = (await response.json()) as JsonWebKeySet;
  return jwks.keys;
}

function stringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function validateIdentityClaims(
  claims: Record<string, unknown>,
  config: { tenantId: string; clientId: string },
  nonce: string
) {
  const issuer = stringClaim(claims.iss);
  const audience = stringClaim(claims.aud);
  const expiresAt = typeof claims.exp === "number" ? claims.exp : 0;

  if (claims.nonce !== nonce) {
    throw new Error("Microsoft sign-in response nonce did not match the original request.");
  }

  if (audience !== config.clientId) {
    throw new Error("Microsoft sign-in token audience did not match this application.");
  }

  if (!issuer || !issuer.includes(config.tenantId)) {
    throw new Error("Microsoft sign-in token issuer did not match this tenant.");
  }

  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("Microsoft sign-in token has expired.");
  }
}

function getEntraConfig(origin: string) {
  const tenantId = process.env.ENTRA_TENANT_ID ?? process.env.AZURE_TENANT_ID;
  const clientId = process.env.ENTRA_CLIENT_ID ?? process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  const redirectUri = process.env.ENTRA_REDIRECT_URI ?? `${origin}/api/v1/auth/callback`;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and ENTRA_CLIENT_SECRET must be configured.");
  }

  return { tenantId, clientId, clientSecret, redirectUri };
}
