/**
 * Typed authenticated fetch wrapper.
 *
 * Every request injects the bearer token automatically, normalises error
 * handling into thrown `Error`s, and transparently handles 401s by clearing the
 * token and invoking an optional `onUnauthorized` callback. Drop-in compatible
 * with the original `api(path, opts, onUnauthorized)` signature.
 */
import { API_BASE_URL } from "../config";
import { clearToken, getToken } from "../auth/token";

export interface ErrorEnvelope {
  error?: { code?: string; message?: string };
  detail?: string;
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
  onUnauthorized?: () => void,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Let the browser set the multipart boundary for FormData bodies.
  if (!(opts.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  const response = await fetch(API_BASE_URL + path, { ...opts, headers });

  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error("Session expired — please log in again");
  }
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({}))) as ErrorEnvelope;
    const message =
      body.error?.message ?? body.detail ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  // 204 No Content guard.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Authenticated binary download: fetches `path` with the bearer token and
 * triggers a browser save dialog using the server-provided filename.
 */
export async function apiDownload(
  path: string,
  fallbackName = "download",
  onUnauthorized?: () => void,
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(API_BASE_URL + path, { headers });
  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error("Session expired — please log in again");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorEnvelope;
    throw new Error(
      body.error?.message ?? body.detail ?? `Download failed (${response.status})`,
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
