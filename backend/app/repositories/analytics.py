"""Read-only aggregate queries powering the stats & analytics endpoints."""

from __future__ import annotations

import asyncpg


class AnalyticsRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def stats(self) -> dict:
        c = self._conn
        return {
            "total_candidates": await c.fetchval("SELECT COUNT(*) FROM candidates"),
            "pending": await c.fetchval("SELECT COUNT(*) FROM candidates WHERE status='pending'"),
            "shortlisted": await c.fetchval(
                "SELECT COUNT(*) FROM candidates WHERE status='shortlisted'"
            ),
            "rejected": await c.fetchval("SELECT COUNT(*) FROM candidates WHERE status='rejected'"),
            "active_jobs": await c.fetchval("SELECT COUNT(*) FROM jobs WHERE status='active'"),
            "avg_match_score": await c.fetchval(
                "SELECT AVG(match_score) FROM candidates WHERE match_score>0"
            ),
            "interviews_scheduled": await c.fetchval("SELECT COUNT(*) FROM interviews"),
            "emails_sent": await c.fetchval("SELECT COUNT(*) FROM email_logs WHERE status='sent'"),
            "evaluation_accuracy": await c.fetchval(
                "SELECT ROUND(COUNT(CASE WHEN is_correct THEN 1 END)*100.0"
                "/NULLIF(COUNT(*),0),1) FROM evaluation_results"
            ),
        }

    async def overview(self) -> dict:
        c = self._conn
        return {
            "total": await c.fetchval("SELECT COUNT(*) FROM candidates"),
            "shortlisted": await c.fetchval(
                "SELECT COUNT(*) FROM candidates WHERE status='shortlisted'"
            ),
            "rejected": await c.fetchval("SELECT COUNT(*) FROM candidates WHERE status='rejected'"),
            "interviewed": await c.fetchval("SELECT COUNT(*) FROM interviews"),
            "emails_sent": await c.fetchval("SELECT COUNT(*) FROM email_logs WHERE status='sent'"),
            "active_jobs": await c.fetchval("SELECT COUNT(*) FROM jobs WHERE status='active'"),
            "avg_score": await c.fetchval(
                "SELECT AVG(match_score) FROM candidates WHERE match_score>0"
            )
            or 0,
            "top_score": await c.fetchval("SELECT MAX(match_score) FROM candidates") or 0,
            "eval_acc": await c.fetchval(
                "SELECT ROUND(COUNT(CASE WHEN is_correct THEN 1 END)*100.0"
                "/NULLIF(COUNT(*),0),1) FROM evaluation_results"
            ),
            # Full 14-day series (empty days filled with 0). A plain GROUP BY
            # returns only days that have uploads, so with data on a single day
            # the chart drew a lone point and no line — generate_series gives a
            # continuous 14-point series the line chart can actually render.
            "cvs_per_day": await c.fetch(
                "SELECT d::date AS day, COALESCE(cnt, 0) AS count "
                "FROM generate_series("
                "  CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day'"
                ") AS d "
                "LEFT JOIN ("
                "  SELECT DATE(created_at) AS day, COUNT(*) AS cnt FROM candidates "
                "  WHERE created_at >= CURRENT_DATE - INTERVAL '13 days' "
                "  GROUP BY DATE(created_at)"
                ") counts ON counts.day = d::date "
                "ORDER BY day"
            ),
            "status_dist": await c.fetch(
                "SELECT status, COUNT(*) AS count FROM candidates GROUP BY status"
            ),
            "score_buckets": await c.fetch(
                "SELECT CASE WHEN match_score>=90 THEN '90-100' "
                "WHEN match_score>=80 THEN '80-89' WHEN match_score>=70 THEN '70-79' "
                "WHEN match_score>=60 THEN '60-69' WHEN match_score>=50 THEN '50-59' "
                "ELSE 'Below 50' END AS bucket, COUNT(*) AS count FROM candidates "
                "WHERE match_score>0 GROUP BY bucket ORDER BY bucket DESC"
            ),
            "top_skills": await c.fetch(
                "SELECT unnest(skills) AS skill, COUNT(*) AS count FROM candidates "
                "WHERE status='shortlisted' GROUP BY skill ORDER BY count DESC LIMIT 10"
            ),
            "job_funnel": await c.fetch(
                "SELECT j.title, j.id, COUNT(c.id) AS total_applied, "
                "COUNT(CASE WHEN c.status='shortlisted' THEN 1 END) AS shortlisted, "
                "COUNT(CASE WHEN c.status='rejected' THEN 1 END) AS rejected, "
                "ROUND(AVG(c.match_score)::numeric,1) AS avg_score FROM jobs j "
                "LEFT JOIN candidates c ON c.matched_job_id=j.id "
                "GROUP BY j.id, j.title ORDER BY total_applied DESC LIMIT 8"
            ),
            "recent": await c.fetch(
                "SELECT 'cv_upload' AS type, name AS label, created_at AS ts "
                "FROM candidates UNION ALL SELECT 'interview' AS type, "
                "candidate_name AS label, created_at AS ts FROM interviews "
                "UNION ALL SELECT 'email' AS type, CONCAT(email_type,' → ',to_email) "
                "AS label, sent_at AS ts FROM email_logs WHERE status='sent' "
                "ORDER BY ts DESC LIMIT 12"
            ),
        }
