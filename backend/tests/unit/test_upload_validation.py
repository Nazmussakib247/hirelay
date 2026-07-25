"""Tests for upload hardening (size cap, magic bytes) and text extraction."""

from __future__ import annotations

import io

import docx
import pytest
from app.core.exceptions import ValidationError
from app.services import cv_parser
from app.services.candidates import CandidateService


# ── Magic-byte validation ────────────────────────────────────────────────────
def test_magic_bytes_accepts_real_pdf_header():
    cv_parser.verify_magic_bytes("cv.pdf", b"%PDF-1.7 rest-of-file")


def test_magic_bytes_rejects_renamed_file_as_pdf():
    with pytest.raises(ValidationError):
        cv_parser.verify_magic_bytes("cv.pdf", b"MZ\x90\x00 this is an exe")


def test_magic_bytes_accepts_docx_zip_container():
    cv_parser.verify_magic_bytes("cv.docx", b"PK\x03\x04 zip content")


def test_magic_bytes_rejects_text_file_as_docx():
    with pytest.raises(ValidationError):
        cv_parser.verify_magic_bytes("cv.docx", b"just plain text")


def test_magic_bytes_ignores_unknown_extensions():
    # extension gate happens later in extract_text; no signature to enforce
    cv_parser.verify_magic_bytes("cv.txt", b"anything")


# ── Size cap ─────────────────────────────────────────────────────────────────
def test_upload_rejects_oversized_file(monkeypatch):
    from app import config

    settings = config.get_settings()
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    huge = b"%PDF" + b"0" * (2 * 1024 * 1024)
    with pytest.raises(ValidationError):
        CandidateService._validate_upload("cv.pdf", huge)


def test_upload_rejects_empty_file():
    with pytest.raises(ValidationError):
        CandidateService._validate_upload("cv.pdf", b"")


# ── DOCX end-to-end extraction ───────────────────────────────────────────────
def _build_docx(paragraphs: list[str]) -> bytes:
    document = docx.Document()
    for p in paragraphs:
        document.add_paragraph(p)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_docx_roundtrip_extraction_and_parsing():
    data = _build_docx(
        [
            "Arman Hossain",
            "Python developer with 5 years experience.",
            "Skills: python, django, postgresql, docker",
            "BSc in Computer Science",
            "arman.hossain@example.com  +8801712345678",
        ]
    )
    text = cv_parser.extract_text("cv.docx", data)
    parsed = cv_parser.parse_cv(text)
    assert parsed["name"] == "Arman Hossain"
    assert parsed["email"] == "arman.hossain@example.com"
    assert parsed["experience_years"] == 5
    assert {"python", "django", "postgresql", "docker"} <= set(parsed["skills"])


def test_pdf_extraction_raises_clean_error_on_garbage():
    with pytest.raises(ValidationError):
        cv_parser.extract_text("cv.pdf", b"%PDF-1.4 not really a pdf body")
