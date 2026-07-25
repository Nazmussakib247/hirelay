/**
 * Typed endpoint helpers — a thin, fully type-checked layer over the generic
 * `api<T>()` wrapper. Each function pins the exact response contract from
 * `../types`, so any `.ts` / `.tsx` caller gets autocomplete and compile-time
 * checking of the fields it reads.
 *
 * The existing `.jsx` components still call `api()` directly (they are not
 * type-checked while `checkJs` is off); they can migrate to these helpers
 * one file at a time as they become `.tsx`. Nothing here changes runtime
 * behaviour — these are the same requests the components already make.
 */
import { api } from "./client";
import type {
  Candidate,
  EvalSampleResult,
  EvaluationRun,
  Job,
  LoginResponse,
  NotificationList,
  Page,
  SkillSuggestResponse,
  Stats,
  UploadResponse,
  User,
} from "../types";

/** Optional 401 handler passed through to `api()` (clears token + redirects). */
type OnUnauthorized = (() => void) | undefined;

const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

/* ─── Auth ──────────────────────────────────────────────────────────────── */

export const login = (username: string, password: string) =>
  api<LoginResponse>("/auth/login", json({ username, password }));

export const getMe = (onUnauthorized?: OnUnauthorized) =>
  api<User>("/auth/me", {}, onUnauthorized);

/* ─── Dashboard ─────────────────────────────────────────────────────────── */

export const getStats = (onUnauthorized?: OnUnauthorized) =>
  api<Stats>("/stats", {}, onUnauthorized);

/* ─── Jobs ──────────────────────────────────────────────────────────────── */

export const listJobs = (onUnauthorized?: OnUnauthorized) =>
  api<Job[]>("/jobs", {}, onUnauthorized);

export const suggestSkills = (
  description: string,
  title: string | null,
  onUnauthorized?: OnUnauthorized,
) =>
  api<SkillSuggestResponse>(
    "/jobs/suggest-skills",
    json({ description, title }),
    onUnauthorized,
  );

/* ─── Candidates ────────────────────────────────────────────────────────── */

/** `query` is a pre-built URLSearchParams string (status / job / q filters).
 *  The endpoint returns a `Page<Candidate>`, but older callers also accept a
 *  bare array — hence the union. */
export const listCandidates = (query = "", onUnauthorized?: OnUnauthorized) =>
  api<Page<Candidate> | Candidate[]>(
    query ? `/candidates?${query}` : "/candidates",
    {},
    onUnauthorized,
  );

export const uploadCv = (file: File, onUnauthorized?: OnUnauthorized) => {
  const fd = new FormData();
  fd.append("file", file);
  return api<UploadResponse>("/upload-cv", { method: "POST", body: fd }, onUnauthorized);
};

/* ─── Notifications ─────────────────────────────────────────────────────── */

export const getNotifications = (onUnauthorized?: OnUnauthorized) =>
  api<NotificationList>("/notifications", {}, onUnauthorized);

export const getUnreadCount = (onUnauthorized?: OnUnauthorized) =>
  api<{ unread: number }>("/notifications/unread-count", {}, onUnauthorized);

/* ─── Evaluation benchmark ──────────────────────────────────────────────── */

export const runEvaluation = (onUnauthorized?: OnUnauthorized) =>
  api<EvaluationRun>("/evaluation/run", { method: "POST" }, onUnauthorized);

export const getEvaluationResults = (onUnauthorized?: OnUnauthorized) =>
  api<EvalSampleResult[]>("/evaluation/results", {}, onUnauthorized);
