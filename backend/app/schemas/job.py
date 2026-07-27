"""Job schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

JobStatus = Literal["active", "closed", "draft"]


class JobCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    # Optional per-skill importance weights (1-10) keyed by skill keyword.
    # Skills present only in the weight map are merged into required_skills.
    skill_weights: dict[str, int] = Field(default_factory=dict)
    min_experience: int = Field(default=0, ge=0, le=50)
    # Optional per-job shortlist cutoff (0-100). None → the global, benchmark-
    # tuned MATCH_THRESHOLD is used for this job.
    match_threshold: int | None = Field(default=None, ge=0, le=100)
    # Location shown in job announcements (blank → a sensible default is used).
    location: str | None = Field(default=None, max_length=255)
    # Optional custom announcement text. Blank → the default template is used.
    # May contain {title} {location} {experience} {skills} {description}
    # {apply_url} placeholders.
    post_message: str | None = Field(default=None, max_length=4000)
    # Optional custom email bodies. Blank → the built-in template is used.
    # interview: {name} {job_title} {score} {interview_time} {meet_link}
    # rejection: {name} {job_title}
    interview_message: str | None = Field(default=None, max_length=4000)
    rejection_message: str | None = Field(default=None, max_length=4000)

    @field_validator("skill_weights")
    @classmethod
    def _validate_weights(cls, v: dict[str, int]) -> dict[str, int]:
        cleaned: dict[str, int] = {}
        for skill, weight in v.items():
            name = skill.strip().lower()
            if not name:
                continue
            if not 1 <= int(weight) <= 10:
                raise ValueError(f"weight for '{name}' must be between 1 and 10")
            cleaned[name] = int(weight)
        return cleaned

    @model_validator(mode="after")
    def _merge_weighted_skills(self) -> JobCreate:
        skills = [s.strip().lower() for s in self.required_skills if s.strip()]
        for weighted in self.skill_weights:
            if weighted not in skills:
                skills.append(weighted)
        self.required_skills = skills
        return self


class JobSkillsUpdate(BaseModel):
    """Edit a job's skill keywords and per-skill weights."""

    required_skills: list[str] = Field(default_factory=list)
    skill_weights: dict[str, int] = Field(default_factory=dict)
    # None → leave the job's existing threshold unchanged.
    match_threshold: int | None = Field(default=None, ge=0, le=100)

    @field_validator("skill_weights")
    @classmethod
    def _weights_in_range(cls, v: dict[str, int]) -> dict[str, int]:
        cleaned: dict[str, int] = {}
        for skill, weight in v.items():
            name = skill.strip().lower()
            if not name:
                continue
            if not 1 <= int(weight) <= 10:
                raise ValueError(f"weight for '{name}' must be between 1 and 10")
            cleaned[name] = int(weight)
        return cleaned

    @model_validator(mode="after")
    def _merge_weighted_skills(self) -> JobSkillsUpdate:
        skills = [s.strip().lower() for s in self.required_skills if s.strip()]
        for weighted in self.skill_weights:
            if weighted not in skills:
                skills.append(weighted)
        self.required_skills = skills
        return self


class JobSkillsUpdateResponse(BaseModel):
    success: bool = True
    job_id: str
    required_skills: list[str]
    skill_weights: dict[str, int]
    match_threshold: int | None = None


class JobCreateResponse(BaseModel):
    success: bool = True
    job_id: str


class JobStatusUpdate(BaseModel):
    status: JobStatus


class JobStatusUpdateResponse(BaseModel):
    success: bool = True
    job_id: str
    previous_status: str
    new_status: str


class SkillSuggestRequest(BaseModel):
    """Input for AI-assisted skill keyword + weight suggestion."""

    description: str = Field(..., min_length=10, max_length=10_000)
    title: str | None = Field(default=None, max_length=255)


class SkillWeightSuggestion(BaseModel):
    skill: str
    weight: int = Field(ge=1, le=10)


class SkillSuggestResponse(BaseModel):
    skills: list[SkillWeightSuggestion]
    source: Literal["ai", "keyword-fallback"]
