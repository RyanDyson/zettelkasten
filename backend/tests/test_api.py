import asyncio
import io
import time

import pytest
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

from app import worker
from app.config import NOTES_DIR, RAW_DIR, TRANSCRIPTS_DIR, settings
from app.db import SessionLocal
from app.models import JobStatus, Source, new_id
from app.pipeline.core import ProcessingError, Transcription


def pdf_bytes(text="Apples contain dietary fibre.", encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=400, height=400)
    if text:
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                                 NameObject("/Subtype"): NameObject("/Type1"),
                                 NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({
            NameObject("/F1"): writer._add_object(font)})})
        content = DecodedStreamObject()
        content.set_data(f"BT /F1 12 Tf 20 350 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(content)
    if encrypted:
        writer.encrypt("secret")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def upload(client, name, data):
    response = client.post("/ingest", files={"file": (name, data)})
    assert response.status_code == 202, response.text
    return response.json()["source_id"]


def wait_job(client, source_id):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        result = client.get(f"/jobs/{source_id}")
        assert result.status_code == 200
        job = result.json()
        if job["status"] in ("done", "failed"):
            return job
        time.sleep(0.02)
    pytest.fail("Job did not finish")


def test_pdf_end_to_end_and_database_source_of_truth(client):
    source_id = upload(client, "../../Apples.PDF", pdf_bytes())
    job = wait_job(client, source_id)
    assert job["status"] == "done", job
    assert len(job["notes"]) == 1
    assert client.get(f"/sources/{source_id}").json()["original_name"] == "Apples.PDF"
    transcript = client.get(job["transcript_url"]).json()
    assert "Apples contain dietary fibre." in transcript["content"]
    assert transcript["model"] is None
    assert transcript["segments"] == []
    assert (NOTES_DIR / f"{source_id}.md").exists()
    (NOTES_DIR / f"{source_id}.md").unlink()
    (TRANSCRIPTS_DIR / f"{source_id}.md").unlink()
    note = client.get(f"/notes/{source_id}").json()
    assert note["content"] == transcript["content"]
    download = client.get(f"/sources/{source_id}/transcript/download")
    assert download.text == transcript["content"]
    assert "attachment" in download.headers["content-disposition"]
    assert client.post(f"/jobs/{source_id}/retry").status_code == 409


@pytest.mark.parametrize("filename,data,code", [
    ("notes.txt", b"apples", 415), ("notes.md", b"apples", 415),
    ("file.docx", b"data", 415), ("empty.pdf", b"", 400),
])
def test_invalid_uploads(client, filename, data, code):
    before = set(RAW_DIR.iterdir())
    assert client.post("/ingest", files={"file": (filename, data)}).status_code == code
    assert set(RAW_DIR.iterdir()) == before


@pytest.mark.parametrize("data,message", [
    (b"not a pdf", "Cannot read"), (pdf_bytes(text=""), "OCR"),
    (pdf_bytes(encrypted=True), "Encrypted"),
])
def test_pdf_failures(client, data, message):
    source_id = upload(client, "bad.pdf", data)
    job = wait_job(client, source_id)
    assert job["status"] == "failed"
    assert message in job["error"]
    assert job["notes"] == []
    assert client.get(f"/sources/{source_id}/transcript").status_code == 409
    assert client.post(f"/jobs/{source_id}/retry").status_code == 202
    assert wait_job(client, source_id)["status"] == "failed"


def test_limits_and_cleanup(client, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    before = set(RAW_DIR.iterdir())
    assert client.post("/ingest", files={"file": ("big.pdf", b"x" * (1024**2 + 1))}).status_code == 413
    assert set(RAW_DIR.iterdir()) == before
    assert client.post("/ingest", files={"file": ("big.pdf", b"x" * (3 * 1024**2))}).status_code == 413
    body = [b'--boundary\r\nContent-Disposition: form-data; name="file"; filename="big.pdf"\r\n'
            b'Content-Type: application/pdf\r\n\r\n', *([b"x" * 1024**2] * 3), b'\r\n--boundary--\r\n']
    assert client.post("/ingest", content=iter(body),
                       headers={"Content-Type": "multipart/form-data; boundary=boundary"}).status_code == 413
    assert set(RAW_DIR.iterdir()) == before


@pytest.mark.parametrize("filename,kind", [("speech.mp3", "audio"), ("lecture.mp4", "video")])
def test_media_contract_nonblocking_and_cleanup(client, monkeypatch, filename, kind):
    def extract(source, destination):
        destination.write_bytes(b"temporary audio")
        return destination

    def transcribe(path):
        time.sleep(0.3)
        return Transcription("Apples are fruit.", "en", 2.5,
                             [{"start": 0.0, "end": 2.5, "text": "Apples are fruit."}], "test-model")

    monkeypatch.setattr(worker, "extract_audio", extract)
    monkeypatch.setattr(worker, "transcribe", transcribe)
    source_id = upload(client, filename, b"test media")
    start = time.monotonic()
    assert client.get("/health").status_code == 200
    assert time.monotonic() - start < 0.25
    job = wait_job(client, source_id)
    assert job["status"] == "done", job
    transcript = client.get(job["transcript_url"]).json()
    assert transcript["language"] == "en" and transcript["duration_seconds"] == 2.5
    assert transcript["segments"][0]["text"] == "Apples are fruit."
    assert client.get(f"/sources/{source_id}").json()["kind"] == kind
    assert not (TRANSCRIPTS_DIR / f"{source_id}.wav").exists()


def test_media_failure_and_retry(client, monkeypatch):
    def fail(source, destination):
        destination.write_bytes(b"partial")
        raise ProcessingError("No audio track.")
    monkeypatch.setattr(worker, "extract_audio", fail)
    source_id = upload(client, "silent.mp4", b"dummy")
    assert wait_job(client, source_id)["error"] == "No audio track."
    assert not (TRANSCRIPTS_DIR / f"{source_id}.wav").exists()
    monkeypatch.setattr(worker, "extract_audio", lambda source, destination: destination)
    monkeypatch.setattr(worker, "transcribe", lambda path: Transcription("Recovered."))
    assert client.post(f"/jobs/{source_id}/retry").status_code == 202
    assert wait_job(client, source_id)["status"] == "done"


@pytest.mark.parametrize("state", [JobStatus.queued, JobStatus.processing])
def test_recovers_jobs_present_before_startup(database, state):
    from app.main import app
    from app.db import dispose, init_db
    from fastapi.testclient import TestClient
    source_id = new_id()
    path = RAW_DIR / f"{source_id}.pdf"
    path.write_bytes(pdf_bytes())

    async def seed():
        await init_db()
        async with SessionLocal() as session:
            session.add(Source(id=source_id, kind="pdf", original_name="recovered.pdf",
                               raw_path=str(path), status=state))
            await session.commit()
        await dispose()
    asyncio.run(seed())
    with TestClient(app) as client:
        job = wait_job(client, source_id)
        assert job["status"] == "done"
        assert len(job["notes"]) == 1
        client.portal.call(worker.process, source_id)
        assert len(client.get(f"/jobs/{source_id}").json()["notes"]) == 1
    with TestClient(app) as client:
        assert client.get(f"/sources/{source_id}/transcript").status_code == 200


def test_docs_cors_pagination_and_missing_records(client):
    assert client.get("/docs").status_code == 200
    schema = client.get("/openapi.json").json()
    assert "202" in schema["paths"]["/ingest"]["post"]["responses"]
    assert "/graph" not in schema["paths"] and "/search" not in schema["paths"]
    for path in ("/jobs/missing", "/sources/missing", "/sources/missing/transcript", "/notes/missing"):
        assert client.get(path).status_code == 404
    assert client.get("/sources?limit=0").status_code == 422
    assert client.get("/notes?offset=-1").status_code == 422
    assert len(client.get("/sources?limit=1").json()) <= 1
    response = client.options("/ingest", headers={"Origin": "http://localhost:3000",
                                               "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
