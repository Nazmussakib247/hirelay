"""Shared skill vocabulary, alias normalisation and boundary-aware matching.

Single source of truth used by both the CV parser (extraction) and the
matching engine (comparison), so a skill written any common way on a CV
("ReactJS", "react.js", "React") always resolves to the same canonical form
that HR uses in a job's required-skill keywords.

Key properties:
    * word-boundary matching — "java" no longer matches inside "javascript",
      "go" no longer matches inside "google" (the old parser used raw
      substring checks and suffered exactly these false positives)
    * alias-aware — "k8s" on a CV matches a job requiring "kubernetes"
    * extensible at runtime — ``extract_skills_from_text`` accepts extra
      keywords (e.g. every job's custom required skills from the DB) so HR's
      per-job vocabulary is detected in CVs without a code change
"""

from __future__ import annotations

import re
from functools import lru_cache

# ── Canonical skill vocabulary ───────────────────────────────────────────────
SKILL_KEYWORDS: list[str] = [
    # languages
    "python",
    "java",
    "javascript",
    "typescript",
    "c++",
    "c#",
    "c",
    "php",
    "ruby",
    "go",
    "rust",
    "kotlin",
    "swift",
    "scala",
    "perl",
    "dart",
    "matlab",
    # frontend
    "react",
    "angular",
    "vue",
    "next.js",
    "svelte",
    "redux",
    "html",
    "css",
    "sass",
    "tailwind",
    "bootstrap",
    "jquery",
    "webpack",
    "vite",
    # backend / runtime
    "node.js",
    "express",
    "django",
    "flask",
    "fastapi",
    "spring boot",
    "laravel",
    ".net",
    "graphql",
    "rest api",
    "grpc",
    "websocket",
    "microservices",
    # mobile
    "android",
    "ios",
    "react native",
    "flutter",
    # data stores
    "sql",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "sqlite",
    "oracle",
    "sql server",
    "dynamodb",
    "cassandra",
    "firebase",
    "supabase",
    # devops / cloud
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "gcp",
    "terraform",
    "ansible",
    "jenkins",
    "ci/cd",
    "github actions",
    "gitlab",
    "nginx",
    "linux",
    "bash",
    "powershell",
    "git",
    "prometheus",
    "grafana",
    "rabbitmq",
    "kafka",
    # ml / data
    "machine learning",
    "deep learning",
    "natural language processing",
    "computer vision",
    "tensorflow",
    "pytorch",
    "keras",
    "scikit-learn",
    "opencv",
    "llm",
    "langchain",
    "generative ai",
    "prompt engineering",
    "data analysis",
    "data science",
    "data engineering",
    "pandas",
    "numpy",
    "matplotlib",
    "tableau",
    "power bi",
    "excel",
    "etl",
    "airflow",
    "spark",
    "hadoop",
    # testing / practices
    "selenium",
    "cypress",
    "jest",
    "pytest",
    "junit",
    "unit testing",
    "tdd",
    "agile",
    "scrum",
    "jira",
    "oop",
    "design patterns",
    "system design",
    # design
    "figma",
    "ui/ux",
    "photoshop",
    "illustrator",
    "adobe xd",
    "canva",
    # soft skills
    "communication",
    "leadership",
    "teamwork",
    "problem solving",
    "project management",
    "time management",
    "critical thinking",
    "presentation",
    "mentoring",
]

# ── Alias / shorthand → canonical form ───────────────────────────────────────
SKILL_ALIASES: dict[str, str] = {
    # languages
    "js": "javascript",
    "es6": "javascript",
    "ecmascript": "javascript",
    "ts": "typescript",
    "py": "python",
    "python3": "python",
    "golang": "go",
    "c sharp": "c#",
    "csharp": "c#",
    "cpp": "c++",
    "c plus plus": "c++",
    # frontend
    "reactjs": "react",
    "react.js": "react",
    "vuejs": "vue",
    "vue.js": "vue",
    "nextjs": "next.js",
    "next": "next.js",
    "angularjs": "angular",
    "tailwindcss": "tailwind",
    "html5": "html",
    "css3": "css",
    "scss": "sass",
    # backend / runtime
    "node": "node.js",
    "nodejs": "node.js",
    "expressjs": "express",
    "express.js": "express",
    "dotnet": ".net",
    ".net core": ".net",
    "asp.net": ".net",
    "springboot": "spring boot",
    "spring": "spring boot",
    "restful": "rest api",
    "rest": "rest api",
    "restapi": "rest api",
    "rest apis": "rest api",
    "gql": "graphql",
    "websockets": "websocket",
    # mobile
    "reactnative": "react native",
    # data stores
    "postgres": "postgresql",
    "psql": "postgresql",
    "pg": "postgresql",
    "mongo": "mongodb",
    "es": "elasticsearch",
    "ms sql": "sql server",
    "mssql": "sql server",
    # devops / cloud
    "k8s": "kubernetes",
    "amazon web services": "aws",
    "google cloud platform": "gcp",
    "google cloud": "gcp",
    "cicd": "ci/cd",
    "ci-cd": "ci/cd",
    "ci cd": "ci/cd",
    "iac": "terraform",
    "gh actions": "github actions",
    # ml / data
    "ml": "machine learning",
    "dl": "deep learning",
    "tf": "tensorflow",
    "sklearn": "scikit-learn",
    "scikit learn": "scikit-learn",
    "nlp": "natural language processing",
    "cv": "computer vision",
    "large language models": "llm",
    "llms": "llm",
    "powerbi": "power bi",
    "ms excel": "excel",
    "microsoft excel": "excel",
    # design
    "ux": "ui/ux",
    "ui": "ui/ux",
    "ui ux": "ui/ux",
    "ux/ui": "ui/ux",
    "adobe photoshop": "photoshop",
    "adobe illustrator": "illustrator",
}

# Surface forms too ambiguous to detect in free-running CV prose (they are
# ordinary English words or 1-2 letter tokens). They still normalise via
# SKILL_ALIASES when HR lists them explicitly as job keywords, but the text
# scanner skips them to avoid false positives ("spring 2024", "next page",
# "rest of the team", a CV literally titled "CV"...).
AMBIGUOUS_IN_TEXT: frozenset[str] = frozenset(
    {
        "go",
        "c",
        "next",
        "es",
        "pg",
        "tf",
        "cv",
        "rest",
        "spring",
        "express",
        "ui",
        "ux",
        "ts",
        "py",
        "ml",
        "dl",
    }
)

# "Go" is detectable case-sensitively (the capitalised language name) plus via
# the unambiguous "golang" alias.
_GO_PATTERN = re.compile(r"(?<![A-Za-z0-9+#.])Go(?![A-Za-z0-9+#])")


def normalize_skill(skill: str) -> str:
    """Lowercase, trim, collapse whitespace, then resolve known aliases."""
    cleaned = re.sub(r"\s+", " ", skill.strip().lower())
    return SKILL_ALIASES.get(cleaned, cleaned)


@lru_cache(maxsize=4096)
def _compile(term: str) -> re.Pattern[str]:
    """Compile a word-boundary-safe, case-insensitive pattern for one term.

    Custom boundaries (instead of ``\\b``) so terms containing ``+ # .`` work:
    ``c++``, ``c#``, ``.net``, ``node.js``, ``ci/cd``. Spaces/hyphens between
    words are interchangeable ("machine learning" == "machine-learning").
    """
    escaped = re.escape(term).replace(r"\ ", r"[\s\-]+")
    return re.compile(rf"(?<![a-z0-9+#]){escaped}(?![a-z0-9+#])", re.IGNORECASE)


def _build_surface_map() -> dict[str, str]:
    """All searchable surface forms → canonical skill."""
    surface: dict[str, str] = {k: normalize_skill(k) for k in SKILL_KEYWORDS}
    for alias, canonical in SKILL_ALIASES.items():
        surface.setdefault(alias, canonical)
    return {s: c for s, c in surface.items() if s not in AMBIGUOUS_IN_TEXT}


_SURFACE_MAP: dict[str, str] = _build_surface_map()


def extract_skills_from_text(text: str, extra_keywords: list[str] | None = None) -> list[str]:
    """Find every known (or extra/custom) skill mentioned in ``text``.

    ``extra_keywords`` lets callers pass per-job custom keywords (e.g. HR's
    required skills pulled from the DB) so vocabulary outside the built-in
    list — "solidworks", "quickbooks", "bengali typing" — is still detected.
    Returns canonical, deduplicated, sorted skill names.
    """
    found: set[str] = set()
    for surface, canonical in _SURFACE_MAP.items():
        if _compile(surface).search(text):
            found.add(canonical)
    if _GO_PATTERN.search(text):
        found.add("go")
    for raw in extra_keywords or []:
        cleaned = re.sub(r"\s+", " ", str(raw).strip().lower())
        if not cleaned or len(cleaned) > 60:
            continue
        canonical = normalize_skill(cleaned)
        if canonical in found:
            continue
        if (
            cleaned not in AMBIGUOUS_IN_TEXT
            and _compile(cleaned).search(text)
            or canonical != cleaned
            and canonical not in AMBIGUOUS_IN_TEXT
            and _compile(canonical).search(text)
        ):
            found.add(canonical)
    return sorted(found)
