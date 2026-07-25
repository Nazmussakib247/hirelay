"""Analytics & reporting business logic."""

from __future__ import annotations

from datetime import datetime

import asyncpg

from app.config import get_settings
from app.repositories.analytics import AnalyticsRepository


class AnalyticsService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._repo = AnalyticsRepository(conn)

    async def stats(self) -> dict:
        s = await self._repo.stats()
        settings = get_settings()
        return {
            "total_candidates": s["total_candidates"],
            "pending": s["pending"],
            "shortlisted": s["shortlisted"],
            "rejected": s["rejected"],
            "active_jobs": s["active_jobs"],
            "avg_match_score": round(float(s["avg_match_score"] or 0), 1),
            "interviews_scheduled": s["interviews_scheduled"],
            "emails_sent": s["emails_sent"],
            "ai_enabled": settings.ai_enabled,
            "email_enabled": settings.email_enabled,
            "evaluation_accuracy": float(s["evaluation_accuracy"] or 0),
        }

    async def overview(self) -> dict:
        d = await self._repo.overview()
        total = int(d["total"])
        sl = int(d["shortlisted"])
        interviewed = int(d["interviewed"])
        conv_sl = round(sl / total * 100, 1) if total else 0
        conv_iv = round(interviewed / sl * 100, 1) if sl else 0
        return {
            "summary": {
                "total_candidates": total,
                "shortlisted": sl,
                "rejected": int(d["rejected"]),
                "interviewed": interviewed,
                "emails_sent": int(d["emails_sent"]),
                "active_jobs": int(d["active_jobs"]),
                "avg_score": round(float(d["avg_score"]), 1),
                "top_score": round(float(d["top_score"]), 1),
                "conv_shortlist_pct": conv_sl,
                "conv_interview_pct": conv_iv,
                "evaluation_accuracy": float(d["eval_acc"] or 0),
            },
            "cvs_per_day": [
                {"day": str(r["day"]), "count": int(r["count"])} for r in d["cvs_per_day"]
            ],
            "status_dist": [
                {"status": r["status"], "count": int(r["count"])} for r in d["status_dist"]
            ],
            "score_buckets": [
                {"bucket": r["bucket"], "count": int(r["count"])} for r in d["score_buckets"]
            ],
            "top_skills": [
                {"skill": r["skill"], "count": int(r["count"])} for r in d["top_skills"]
            ],
            "job_funnel": [dict(r) for r in d["job_funnel"]],
            "recent": [
                {"type": r["type"], "label": r["label"], "ts": str(r["ts"])} for r in d["recent"]
            ],
        }

    async def report(self) -> dict:
        data = await self.overview()
        s = data["summary"]
        lines = [
            "=" * 55,
            "  HR RECRUITING SYSTEM — ANALYTICS REPORT",
            f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "=" * 55,
            "",
            "FUNNEL SUMMARY",
            f"  Total CVs Received   : {s['total_candidates']}",
            f"  Shortlisted          : {s['shortlisted']} ({s['conv_shortlist_pct']}%)",
            f"  Rejected             : {s['rejected']}",
            f"  Interviews Scheduled : {s['interviewed']} ({s['conv_interview_pct']}% of shortlisted)",
            f"  Emails Sent          : {s['emails_sent']}",
            f"  Active Jobs          : {s['active_jobs']}",
            "",
            "AI EVALUATION ACCURACY",
            f"  Matching Accuracy    : {s['evaluation_accuracy']}% (50-sample benchmark)",
            "",
            "SCORES",
            f"  Average Match Score  : {s['avg_score']}%",
            f"  Top Score            : {s['top_score']}%",
            "",
            "TOP SKILLS (Shortlisted Candidates)",
        ]
        for sk in data["top_skills"][:8]:
            lines.append(f"  {sk['skill']:<25} {sk['count']} candidates")
        lines += ["", "JOB PERFORMANCE"]
        for j in data["job_funnel"]:
            lines.append(
                f"  {j['title'][:30]:<30} Applied:{j['total_applied']}  "
                f"SL:{j['shortlisted']}  Avg:{j['avg_score']}%"
            )
        lines += ["", "=" * 55]
        return {"report": "\n".join(lines), "generated_at": datetime.now().isoformat()}
