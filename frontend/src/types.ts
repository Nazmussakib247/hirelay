/**
 * Domain data contracts shared between the FastAPI backend and this SPA.
 *
 * Derived directly from the backend: the Pydantic schemas in
 * `app/schemas/*` and the `candidates` / `jobs` table columns in
 * `app/db/init.py`. Keeping the shapes in one typed place means the data the
 * UI expects and the data the API actually returns cannot silently drift apart.
 *
 * NOTE — `checkJs` is off, so these types are enforced inside `.ts` / `.tsx`
 * files (the api layer and any future typed component) and serve as the
 * documented contract for the remaining `.jsx` components. Converting a
 * component to `.tsx` immediately turns these into compile-time checks there.
 */

export type Role = "admin" | "recruiter";
export type CandidateStatus = "pending" | "shortlisted" | "rejected";
export type JobStatus = "active" | "closed" | "draft";

/** Standard paginated list envelope (backend `Page[T]`). */
export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

/* ─── Users / auth ──────────────────────────────────────────────────────── */

/** A user account — `GET /auth/me` and the `.user` field of the login response
 *  (backend `UserPublic`). */
export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  full_name?: string | null;
  phone?: string | null;
  job_title?: string | null;
  department?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  last_login?: string | null;
  /** True forces the client through a password change before using the app. */
  must_change_password?: boolean | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

/* ─── Candidates ────────────────────────────────────────────────────────── */

/** A candidate row — items of `GET /candidates` and `GET /candidates/{id}`
 *  (the `candidates` table; `job_title` is added by the detail join). */
export interface Candidate {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number;
  education: string | null;
  cv_filename: string | null;
  status: CandidateStatus;
  match_score: number;
  matched_job_id: string | null;
  ai_summary: string | null;
  notes: string | null;
  /** 0-100 parser confidence; low values warrant an HR double-check. */
  parse_confidence: number | null;
  created_at?: string | null;
  /** Present on the detail endpoint (LEFT JOIN jobs). */
  job_title?: string | null;
}

/** Fields the parser pulled out of an uploaded CV (backend `ExtractedFields`). */
export interface ExtractedFields {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number;
  education: string | null;
}

/** `POST /upload-cv` response (backend `UploadResponse`). */
export interface UploadResponse {
  success: boolean;
  candidate_id: string;
  extracted: ExtractedFields;
  parse_confidence: number | null;
  /** Set when the CV matched an existing candidate by email (record refreshed). */
  duplicate_of?: string | null;
}

/* ─── Jobs ──────────────────────────────────────────────────────────────── */

/** A job posting — `GET /jobs` (the `jobs` table). */
export interface Job {
  id: string;
  title: string;
  description: string | null;
  required_skills: string[];
  /** JSONB — asyncpg may return this as an object or a JSON string; the UI
   *  helper `jobToSkillList` tolerates both. */
  skill_weights: Record<string, number> | string | null;
  min_experience: number;
  status: JobStatus;
  location: string | null;
  post_message: string | null;
  interview_message: string | null;
  rejection_message: string | null;
  created_at?: string | null;
}

export interface SkillWeightSuggestion {
  skill: string;
  weight: number;
}

/** `POST /jobs/suggest-skills` response (backend `SkillSuggestResponse`). */
export interface SkillSuggestResponse {
  skills: SkillWeightSuggestion[];
  source: "ai" | "keyword-fallback";
}

/* ─── Dashboard stats ───────────────────────────────────────────────────── */

/** `GET /stats` — dashboard counters used by the StatsBar. */
export interface Stats {
  total_candidates: number;
  pending: number;
  shortlisted: number;
  rejected: number;
  interviews_scheduled: number;
  emails_sent: number;
  /** Held-out benchmark accuracy (%), 0 when never run. */
  evaluation_accuracy: number;
  ai_enabled: boolean;
  email_enabled: boolean;
}

/* ─── Notifications ─────────────────────────────────────────────────────── */

export interface AppNotification {
  id: string;
  /** e.g. "shortlisted" | "interview_scheduled" | "cv_uploaded". */
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface NotificationList {
  items: AppNotification[];
  unread: number;
}

/* ─── Evaluation benchmark ──────────────────────────────────────────────── */

export interface ConfusionMatrix {
  TP: number;
  TN: number;
  FP: number;
  FN: number;
}

/** One row of `GET /evaluation/results` (per-CV prediction vs. ground truth). */
export interface EvalSampleResult {
  id: string;
  is_correct: boolean;
  cv_text: string;
  ground_truth_label: CandidateStatus | string;
  predicted_label: CandidateStatus | string;
  predicted_score: number;
  skill_score: number;
  experience_score: number;
  tfidf_score: number;
}

/** `POST /evaluation/run` — the top-level fields the Evaluation tab reads.
 *  `held_out` / `train` / `in_sample` are the deliberately-separated blocks
 *  documented in `Documentation/docs/ACCURACY.md`. */
export interface EvaluationRun {
  protocol?: Record<string, unknown>;
  held_out?: Record<string, number>;
  train?: Record<string, number>;
  in_sample?: Record<string, number> & { caveat?: string };
  accuracy_pct: number | null;
  precision_pct: number | null;
  recall_pct: number | null;
  f1_score: number | null;
  confusion_matrix: ConfusionMatrix;
  correct_predictions: number;
  total_samples: number;
}
