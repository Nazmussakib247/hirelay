/* Decode a JWT payload (base64url) — read-only, no signature verification.
   The server verifies the signature; the client only needs the claims (exp,
   role) for UI decisions. Extracted from App.jsx (decomposition phase 2). */

export function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
