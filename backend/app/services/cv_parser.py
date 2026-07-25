"""CV parsing: extract structured fields from raw CV text and files.

These are pure functions (no I/O beyond in-memory file decoding) so they are
trivially unit-testable.

NLP pipeline (deterministic, no heavy dependencies):
    1. text extraction   — PDF (dual engine: pdfplumber + pypdf, best result
                           wins) / DOCX (paragraphs + tables)
    2. section detection — experience / education / skills headers
    3. field extraction  — boundary-aware skill matching (shared vocabulary +
                           aliases + per-job custom keywords), labelled-name /
                           top-lines / email-derived name, BD + international
                           phones, stated *and* date-range-derived experience,
                           degree-ranked education

An optional AI (LLM) pass is layered on top by ``app.services.cv_parser_ai``;
this module always works standalone as the deterministic fallback.
"""

from __future__ import annotations

import io
import re
from contextlib import redirect_stderr
from datetime import datetime

import docx
import pdfplumber
import pypdf

from app.core.exceptions import ValidationError
from app.services.skills import (
    SKILL_KEYWORDS,  # noqa: F401 - re-exported for backwards compatibility
    extract_skills_from_text,
    normalize_skill,
)

_ALLOWED_EXTENSIONS = (".pdf", ".docx", ".doc")
_MAX_RAW_TEXT = 15000
_MAX_SKILLS = 50


# ── File-type validation ─────────────────────────────────────────────────────
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF",),
    ".docx": (b"PK\x03\x04",),  # DOCX is a ZIP container
    ".doc": (b"\xd0\xcf\x11\xe0",),  # legacy OLE compound document
}


def verify_magic_bytes(filename: str, data: bytes) -> None:
    """Reject files whose content does not match their extension.

    Prevents a renamed executable/image from reaching the parsers and gives a
    clear error instead of an obscure parse failure.
    """
    name = filename.lower()
    for ext, signatures in _MAGIC_BYTES.items():
        if name.endswith(ext):
            if not any(data.startswith(sig) for sig in signatures):
                raise ValidationError(
                    f"File content does not look like a valid {ext[1:].upper()} document"
                )
            return


# ── Text extraction ──────────────────────────────────────────────────────────
def _pdf_text_pypdf(data: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    # Join pages with newlines so top-of-page lines (names, headers) stay
    # separated instead of being glued to the previous page's last word.
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _pdf_text_pdfplumber(data: bytes) -> str:
    # pdfplumber (pdfminer-based) is layout-aware: it handles multi-column
    # CVs, tables, and tight kerning far better than plain pypdf. Suppress
    # pdfminer's noisy stderr warnings on slightly malformed files.
    with redirect_stderr(io.StringIO()), pdfplumber.open(io.BytesIO(data)) as pdf:
        pages: list[str] = []
        for page in pdf.pages:
            text = page.extract_text() or ""
            # Tables (skills grids, contact blocks) are often invisible to
            # plain text extraction — append their cell contents explicitly.
            for table in page.extract_tables() or []:
                for row in table:
                    cells = [c.strip() for c in row if c and c.strip()]
                    if cells:
                        text += "\n" + " | ".join(cells)
            pages.append(text)
    return "\n".join(pages)


def _text_quality(text: str) -> int:
    """Rank extraction results: prefer more real (non-whitespace) characters."""
    return len(re.sub(r"\s+", "", text))


def extract_text_from_pdf(data: bytes) -> str:
    """Dual-engine PDF extraction: run pdfplumber and pypdf, keep the best.

    CVs are short documents, so running both engines costs little and the
    quality difference on multi-column or table-heavy layouts is large.
    Either engine may fail on a malformed file — a failure in one never
    hides a success in the other.
    """
    results: list[str] = []
    for extractor in (_pdf_text_pdfplumber, _pdf_text_pypdf):
        try:
            results.append(extractor(data))
        except Exception:  # noqa: BLE001 - fall through to the other engine
            continue
    if not results:
        raise ValidationError("Could not extract text from PDF")
    return max(results, key=_text_quality)


def extract_text_from_docx(data: bytes) -> str:
    document = docx.Document(io.BytesIO(data))
    parts = [p.text for p in document.paragraphs]
    # Skills/contact details frequently live in tables — read those too.
    for table in document.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text.strip() for cell in row.cells))
    return "\n".join(parts)


def extract_text(filename: str, data: bytes) -> str:
    """Decode CV text from an uploaded PDF/DOCX file.

    Raises :class:`ValidationError` on unsupported types, parse failures, or
    empty documents so the caller returns a clean 422.
    """
    name = filename.lower()
    if not name.endswith(_ALLOWED_EXTENSIONS):
        raise ValidationError("Only PDF/DOCX files are supported")
    try:
        raw = extract_text_from_pdf(data) if name.endswith(".pdf") else extract_text_from_docx(data)
    except ValidationError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalise any parser error
        raise ValidationError(f"Could not parse file: {exc}") from exc
    if not raw.strip():
        raise ValidationError(
            "No text could be extracted from the file. If this is a scanned "
            "(image-only) PDF, please upload a text-based PDF or DOCX instead."
        )
    return raw


# ── Section detection ────────────────────────────────────────────────────────
_SECTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "experience": re.compile(
        r"^(work\s+)?(experience|employment(\s+history)?|professional\s+"
        r"(experience|background)|career\s+(history|summary)|work\s+history)\s*:?\s*$",
        re.IGNORECASE,
    ),
    "education": re.compile(
        r"^(education(al)?(\s+(background|qualifications?))?|academic\s+"
        r"(background|qualifications?|history))\s*:?\s*$",
        re.IGNORECASE,
    ),
    "skills": re.compile(
        r"^((technical|core|key|professional)\s+)?(skills?|technologies|"
        r"tech\s+stack|competenc(y|ies)|expertise)\s*:?\s*$",
        re.IGNORECASE,
    ),
}


def split_sections(text: str) -> dict[str, str]:
    """Split CV text into named sections keyed by header type.

    A line is treated as a section header when it is short and matches one of
    the known header patterns. Text before the first header goes to ``_top``.
    """
    sections: dict[str, list[str]] = {"_top": []}
    current = "_top"
    for line in text.split("\n"):
        stripped = line.strip().strip(":").strip()
        matched = None
        if 0 < len(stripped) <= 45:
            for name, pattern in _SECTION_PATTERNS.items():
                if pattern.match(stripped):
                    matched = name
                    break
        if matched:
            current = matched
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items()}


# ── Skills ───────────────────────────────────────────────────────────────────
_SKILL_LABEL_PREFIXES = frozenset(
    {
        "programming languages",
        "languages",
        "frameworks",
        "libraries",
        "databases",
        "tools",
        "technologies",
        "others",
        "other",
        "soft skills",
        "technical skills",
        "platforms",
        "cloud",
        "devops",
        "frontend",
        "backend",
        "web",
        "mobile",
        "misc",
        "concepts",
    }
)


def _skills_section_tokens(section_text: str) -> list[str]:
    """Harvest individual skill tokens from an explicit skills section.

    Tokens listed under a "Skills" header are trusted even when they are not
    in the built-in vocabulary — this is what lets custom/unknown skills
    ("solidworks", "quickbooks") flow into matching automatically.
    """
    tokens: list[str] = []
    for raw in re.split(r"[,;\n•·▪●|]+", section_text):
        token = raw.strip(" \t-–—*:.")
        if ":" in token:  # drop category labels: "Languages: Python" → "Python"
            label, _, rest = token.partition(":")
            if label.strip().lower() in _SKILL_LABEL_PREFIXES:
                token = rest.strip()
        token = re.sub(r"\((.*?)\)", "", token).strip(" \t-–—*:.")
        lowered = token.lower()
        if (
            not token
            or len(token) > 40
            or len(token.split()) > 4
            or lowered in _SKILL_LABEL_PREFIXES
            or "@" in token
            or token.count(".") > 2
        ):
            continue
        tokens.append(normalize_skill(token))
    return tokens


def extract_skills(text: str, extra_keywords: list[str] | None = None) -> list[str]:
    """Boundary-aware skill extraction over the shared vocabulary + aliases.

    ``extra_keywords`` carries per-job custom keywords (HR-defined required
    skills from the DB) so they are detected even when absent from the
    built-in vocabulary. If the CV has an explicit skills section, its listed
    tokens are also included verbatim (normalised).
    """
    found = set(extract_skills_from_text(text, extra_keywords))
    skills_section = split_sections(text).get("skills", "")
    if skills_section:
        found.update(_skills_section_tokens(skills_section))
    # Inline lists: "Skills: python, django, solidworks" on a single line.
    for match in re.finditer(
        r"^\s*(?:technical\s+|core\s+|key\s+)?skills?\s*[:\-]\s*(.+)$",
        text,
        re.IGNORECASE | re.MULTILINE,
    ):
        found.update(_skills_section_tokens(match.group(1)))
    return sorted(found)[:_MAX_SKILLS]


# ── Contact details ──────────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")


def extract_email(text: str) -> str | None:
    match = _EMAIL_RE.search(text)
    return match.group().lower() if match else None


_PHONE_RE = re.compile(
    # Bangladeshi mobile: +8801XXXXXXXXX / 8801... / 01XXXXXXXXX (spaced/dashed)
    r"(?:\+?88\s*)?0?1[3-9]\d{1}[-.\s]?\d{3}[-.\s]?\d{4}"
    # International/generic: +XX (XXX) XXX-XXXX and similar
    r"|\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}"
)


def extract_phone(text: str) -> str | None:
    for match in _PHONE_RE.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        # Reject year-ranges/zip-like hits; real phones carry 10-15 digits
        # (allow 9 for rare short national formats).
        if 9 <= len(digits) <= 15:
            return re.sub(r"\s+", " ", match.group().strip())
    return None


# ── Experience ───────────────────────────────────────────────────────────────
_STATED_EXPERIENCE_PATTERNS = (
    r"(\d{1,2})\s*\+?\s*years?['’]?\s*(?:of\s*)?(?:professional\s*|work(?:ing)?\s*|industry\s*|relevant\s*|hands[- ]on\s*)?experience",
    r"experience\s*(?:of|:)?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)",
    r"(?:over|more\s+than|nearly|around|about)\s+(\d{1,2})\s+years?",
    r"(\d{1,2})\s*\+?\s*yrs?\.?\s*(?:of\s*)?experience",
)

_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+"
_DATE_RANGE_RE = re.compile(
    rf"(?:{_MONTH})?((?:19|20)\d{{2}})\s*(?:-|–|—|to|until|till|~)\s*"
    rf"(?:(?:{_MONTH})?((?:19|20)\d{{2}})|present|current|now|date|ongoing|today)",
    re.IGNORECASE,
)


def _experience_from_date_ranges(text: str) -> int:
    """Sum employment durations from year ranges, merging overlaps.

    "2018-2021" + "2020 - Present" counts continuous coverage, not double.
    """
    current_year = datetime.now().year
    intervals: list[tuple[int, int]] = []
    for match in _DATE_RANGE_RE.finditer(text):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else current_year
        if 1970 <= start <= end <= current_year + 1:
            intervals.append((start, end))
    if not intervals:
        return 0
    intervals.sort()
    total = 0
    cur_start, cur_end = intervals[0]
    for start, end in intervals[1:]:
        if start <= cur_end:
            cur_end = max(cur_end, end)
        else:
            total += cur_end - cur_start
            cur_start, cur_end = start, end
    total += cur_end - cur_start
    return min(total, 40)


def extract_experience_years(text: str) -> int:
    lowered = text.lower()
    stated = 0
    for pattern in _STATED_EXPERIENCE_PATTERNS:
        match = re.search(pattern, lowered)
        if match:
            stated = min(int(match.group(1)), 40)
            break
    if stated:
        return stated
    # Fall back to date-range arithmetic, scoped to the experience section when
    # one exists (so education year ranges don't inflate the result).
    sections = split_sections(text)
    scope = sections.get("experience") or ""
    if not scope:
        non_edu = [v for k, v in sections.items() if k not in ("education",)]
        scope = "\n".join(non_edu)
    return _experience_from_date_ranges(scope)


# ── Education ────────────────────────────────────────────────────────────────
# (rank, keywords) — higher rank wins when several degree lines are present.
_DEGREE_LEVELS: list[tuple[int, tuple[str, ...]]] = [
    (4, ("phd", "ph.d", "doctorate", "doctor of philosophy")),
    (3, ("m.sc", "msc", "master", "mba", "m.eng", "meng", "m.a ", "ma in")),
    (2, ("b.sc", "bsc", "bachelor", "b.tech", "btech", "b.eng", "beng", "bba", "b.a ", "ba in")),
    (1, ("diploma", "associate degree")),
    (0, ("engineering", "computer science", "hsc", "ssc", "a-level", "o-level")),
]


def extract_education(text: str) -> str:
    best_rank = -1
    best_line = ""
    for line in text.split("\n"):
        lowered = line.lower()
        for rank, keywords in _DEGREE_LEVELS:
            if any(k in lowered for k in keywords) and rank > best_rank:
                best_rank = rank
                best_line = line.strip()
                break
    return best_line[:200] if best_line else "Not specified"


# ── Name ─────────────────────────────────────────────────────────────────────
_NAME_STOPWORDS = frozenset(
    {
        "resume",
        "cv",
        "curriculum",
        "vitae",
        "email",
        "phone",
        "mobile",
        "address",
        "profile",
        "objective",
        "summary",
        "contact",
        "linkedin",
        "github",
        "portfolio",
        "developer",
        "engineer",
        "designer",
        "manager",
        "analyst",
        "intern",
        "consultant",
        "specialist",
        "references",
    }
)
_NAME_TOKEN_RE = re.compile(r"^[A-Za-z][A-Za-z.'\-]*$")
_NAME_LABEL_RE = re.compile(
    r"^\s*(?:full\s+)?name\s*[:\-]\s*(.{3,60})$", re.IGNORECASE | re.MULTILINE
)
_GENERIC_EMAIL_LOCALS = frozenset(
    {"info", "admin", "hr", "contact", "hello", "mail", "office", "career", "jobs", "support"}
)


def _valid_name(candidate: str) -> bool:
    words = candidate.split()
    return (
        2 <= len(words) <= 4
        and all(_NAME_TOKEN_RE.match(w) for w in words)
        and not any(w.lower().strip(".") in _NAME_STOPWORDS for w in words)
    )


def _name_from_email(text: str) -> str | None:
    email = extract_email(text)
    if not email:
        return None
    local = email.split("@")[0]
    parts = [p for p in re.split(r"[._\-]+", local) if p.isalpha() and len(p) >= 2]
    if len(parts) >= 2 and parts[0] not in _GENERIC_EMAIL_LOCALS:
        return " ".join(p.capitalize() for p in parts[:3])
    return None


def extract_name(text: str) -> str | None:
    # 1) Explicit "Name: ..." label anywhere in the document.
    label = _NAME_LABEL_RE.search(text)
    if label:
        candidate = label.group(1).strip()
        if _valid_name(candidate):
            return candidate.title() if candidate.isupper() else candidate

    # 2) Scan the first lines — the name is nearly always at the top.
    lines = [ln.strip(" \t•*-–—|") for ln in text.split("\n") if ln.strip()][:8]
    for line in lines:
        if any(ch.isdigit() for ch in line) or "@" in line or "http" in line.lower():
            continue
        if _valid_name(line):
            return line.title() if line.isupper() else line

    # 3) Derive from the email local part (arman.hossain@… → "Arman Hossain").
    return _name_from_email(text)


# ── Orchestration ────────────────────────────────────────────────────────────
def parse_cv(text: str, extra_keywords: list[str] | None = None) -> dict:
    """Return all extracted fields as a dict.

    ``extra_keywords``: per-job custom skill keywords (from every job's
    required skills in the DB) merged into the detection vocabulary so HR's
    customised keywords are recognised in CVs.
    """
    return {
        "name": extract_name(text),
        "email": extract_email(text),
        "phone": extract_phone(text),
        "skills": extract_skills(text, extra_keywords),
        "experience_years": extract_experience_years(text),
        "education": extract_education(text),
        "raw_text": text[:_MAX_RAW_TEXT],
    }
