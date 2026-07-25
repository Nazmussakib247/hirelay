"""Data-access for the evaluation dataset and results tables."""

from __future__ import annotations

import asyncpg


class EvaluationRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self._conn = conn

    async def dataset_count(self) -> int:
        count = await self._conn.fetchval("SELECT COUNT(*) FROM evaluation_dataset")
        return int(count or 0)

    async def insert_sample(
        self,
        cv_text: str,
        job_description: str,
        required_skills: list[str],
        min_experience: int,
        label: str,
        score: float,
    ) -> None:
        await self._conn.execute(
            "INSERT INTO evaluation_dataset (cv_text, job_description, "
            "required_skills, min_experience, ground_truth_label, ground_truth_score) "
            "VALUES ($1,$2,$3,$4,$5,$6)",
            cv_text,
            job_description,
            required_skills,
            min_experience,
            label,
            score,
        )

    async def all_samples(self) -> list[asyncpg.Record]:
        return list(await self._conn.fetch("SELECT * FROM evaluation_dataset"))

    async def clear_results(self) -> None:
        await self._conn.execute("DELETE FROM evaluation_results")

    async def insert_result(
        self,
        dataset_id,
        predicted_score: float,
        predicted_label: str,
        skill: float,
        experience: float,
        tfidf: float,
        ai: float,
        is_correct: bool,
    ) -> None:
        await self._conn.execute(
            "INSERT INTO evaluation_results (dataset_id, predicted_score, "
            "predicted_label, skill_score, experience_score, tfidf_score, ai_score, "
            "is_correct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            dataset_id,
            predicted_score,
            predicted_label,
            skill,
            experience,
            tfidf,
            ai,
            is_correct,
        )

    async def results_with_dataset(self) -> list[asyncpg.Record]:
        rows = await self._conn.fetch(
            "SELECT er.*, ed.ground_truth_label, ed.cv_text, ed.job_description "
            "FROM evaluation_results er "
            "JOIN evaluation_dataset ed ON er.dataset_id = ed.id "
            "ORDER BY er.evaluated_at DESC"
        )
        return list(rows)
