"""Evaluation & ablation routes (academic benchmark)."""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from app.core.dependencies import AdminUserDep, CurrentUserDep
from app.db.pool import get_connection
from app.services.evaluation import EvaluationService

router = APIRouter(prefix="/evaluation", tags=["evaluation"])
ConnDep = Annotated[asyncpg.Connection, Depends(get_connection)]


@router.post("/seed-dataset")
async def seed_dataset(conn: ConnDep, _: AdminUserDep) -> dict:
    return await EvaluationService(conn).seed()


@router.post("/run")
async def run_evaluation(conn: ConnDep, _: CurrentUserDep) -> dict:
    return await EvaluationService(conn).run()


@router.get("/ablation")
async def ablation(conn: ConnDep, _: CurrentUserDep) -> dict:
    return await EvaluationService(conn).ablation()


@router.get("/results")
async def results(conn: ConnDep, _: CurrentUserDep) -> list[dict]:
    return await EvaluationService(conn).results()


@router.get("/agreement")
async def annotator_agreement(conn: ConnDep, _: CurrentUserDep) -> dict:
    """Cohen's kappa between the first and second annotator (when labels exist)."""
    return await EvaluationService(conn).annotator_agreement()


@router.post("/run-ai")
async def run_ai(conn: ConnDep, _: AdminUserDep) -> dict:
    """Held-out benchmark of the AI-enabled weight profile (needs GROQ_API_KEY;
    admin-only since it makes paid LLM calls)."""
    return await EvaluationService(conn).run_ai()
