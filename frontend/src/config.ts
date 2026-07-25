/**
 * Frontend runtime configuration.
 *
 * Resolution order for the API base URL:
 *   1. `VITE_API_URL` (build-time env / Docker build ARG) when set and non-empty
 *   2. Production build → `"/api"` (served through the nginx reverse proxy,
 *      so the SPA works from any host, not just the machine running the API)
 *   3. Dev server → the local FastAPI default
 */
const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE_URL: string =
  fromEnv && fromEnv.length > 0
    ? fromEnv.replace(/\/$/, "")
    : import.meta.env.PROD
      ? "/api"
      : "http://localhost:8000";
