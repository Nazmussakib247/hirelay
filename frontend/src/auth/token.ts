/**
 * JWT store backed by sessionStorage.
 *
 * The token is persisted to sessionStorage so a page reload keeps the user
 * logged in. It is still scoped to the browser tab: closing the tab or the
 * browser clears it. On restore, callers re-validate via /auth/me before
 * treating the session as live.
 */
const STORAGE_KEY = "hr_access_token";

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* storage unavailable (private mode quota etc.) — session lasts in-page only */
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export interface JwtClaims {
  sub: string;
  role: string;
  exp: number;
  iat?: number;
}

/** Decode a JWT payload without verifying the signature (client-side read). */
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as JwtClaims;
  } catch {
    return null;
  }
}
