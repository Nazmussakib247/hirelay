"""Unit tests for CV field extraction."""

from __future__ import annotations

import pytest
from app.core.exceptions import ValidationError
from app.services import cv_parser

SAMPLE = (
    "Arman Hossain\n"
    "Python developer 5 years experience.\n"
    "Skills: python, django, postgresql, docker, git, rest api.\n"
    "BSc Computer Science.\n"
    "arman@example.com  +8801712345678\n"
)


def test_extract_name():
    assert cv_parser.extract_name(SAMPLE) == "Arman Hossain"


def test_extract_name_from_label():
    text = "Curriculum Vitae\nName: Rahim Uddin\nSoftware Engineer"
    assert cv_parser.extract_name(text) == "Rahim Uddin"


def test_extract_name_falls_back_to_email():
    text = "Senior Software Engineer\n10 years experience\nnazmus.sakib@example.com"
    assert cv_parser.extract_name(text) == "Nazmus Sakib"


def test_extract_name_titlecases_all_caps():
    text = "ARMAN HOSSAIN\nSoftware Engineer\narman@example.com"
    assert cv_parser.extract_name(text) == "Arman Hossain"


def test_extract_email():
    assert cv_parser.extract_email(SAMPLE) == "arman@example.com"


def test_extract_phone_bangladeshi():
    assert cv_parser.extract_phone(SAMPLE) is not None
    assert "1712345678" in cv_parser.extract_phone(SAMPLE).replace(" ", "").replace("-", "")


def test_extract_phone_rejects_year_ranges():
    assert cv_parser.extract_phone("Worked 2019 - 2023 at Acme.") is None


def test_extract_experience_years():
    assert cv_parser.extract_experience_years(SAMPLE) == 5


def test_extract_experience_years_variants():
    assert cv_parser.extract_experience_years("Over 7 years in backend development") == 7
    assert cv_parser.extract_experience_years("Experience: 3+ years") == 3
    assert cv_parser.extract_experience_years("12 yrs experience in QA") == 12


def test_extract_experience_from_date_ranges():
    text = (
        "Experience\n"
        "Software Engineer, Acme — Jan 2018 - Dec 2021\n"
        "Senior Engineer, Beta — 2021 - Present\n"
    )
    years = cv_parser.extract_experience_years(text)
    assert years >= 2026 - 2018  # continuous 2018 → now, overlaps merged


def test_education_years_do_not_inflate_experience():
    text = "Education\nB.Sc in CSE, 2015 - 2019\n"
    assert cv_parser.extract_experience_years(text) == 0


def test_extract_skills_finds_known_keywords():
    skills = set(cv_parser.extract_skills(SAMPLE))
    assert {"python", "django", "postgresql", "docker", "git"} <= skills


def test_extract_skills_word_boundaries():
    # The old substring matcher reported "java" for JavaScript CVs and "go"
    # for anything mentioning Google.
    skills = set(cv_parser.extract_skills("Expert in JavaScript and Google Analytics."))
    assert "javascript" in skills
    assert "java" not in skills
    assert "go" not in skills


def test_extract_skills_resolves_aliases():
    skills = set(cv_parser.extract_skills("Built apps with ReactJS, NodeJS and K8s."))
    assert {"react", "node.js", "kubernetes"} <= skills


def test_extract_skills_custom_keywords():
    text = "Certified SolidWorks designer with QuickBooks bookkeeping experience."
    skills = set(cv_parser.extract_skills(text, extra_keywords=["solidworks", "quickbooks"]))
    assert {"solidworks", "quickbooks"} <= skills


def test_extract_skills_from_skills_section_includes_unknown_tokens():
    text = "Jane Doe\nSkills\nPython, SolidWorks, Bengali Typing\nEducation\nBSc"
    skills = set(cv_parser.extract_skills(text))
    assert {"python", "solidworks", "bengali typing"} <= skills


def test_extract_education():
    assert "Computer Science" in cv_parser.extract_education(SAMPLE)


def test_extract_education_prefers_highest_degree():
    text = "B.Sc in CSE, DIU\nM.Sc in Data Science, DU\n"
    assert "M.Sc" in cv_parser.extract_education(text)


def test_parse_cv_truncates_raw_text():
    parsed = cv_parser.parse_cv("x" * 20000)
    assert len(parsed["raw_text"]) == 15000


def test_parse_cv_accepts_extra_keywords():
    parsed = cv_parser.parse_cv("I use AutoCAD daily.", extra_keywords=["autocad"])
    assert "autocad" in parsed["skills"]


def test_extract_text_rejects_unsupported_extension():
    with pytest.raises(ValidationError):
        cv_parser.extract_text("resume.txt", b"hello")
