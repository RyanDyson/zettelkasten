import asyncio
import json
import threading
from pathlib import Path

import pytest
from sqlalchemy import select

from app.config import NOTES_DIR, settings
from app.db import SessionLocal
from app.intelligence import service
from app.models import IntelligenceJob, Link, NoteConcept, NoteDocument, NoteIntelligence
from app.routers.jobs import renamed_markdown
from test_api import pdf_bytes, upload, wait_job
from test_intelligence import fake_analysis, wait_index, indexing


def make_note(client, title='Manage me.pdf'):
    note_id = upload(client, title, pdf_bytes('apples contain fibre'))
    assert wait_job(client, note_id)['status'] == 'done'
    return note_id


def test_rename_changes_only_title_and_preserves_source_and_edits(client):
    note_id = make_note(client)
    edit = {'content': 'My edited content\nwith deliberate spacing.',
            'blocks': [{'type': 'paragraph', 'content': 'My edited content', 'props': {'textColor': 'blue'}}]}
    assert client.post(f'/notes/{note_id}', json=edit).status_code == 200
    original = client.get(f'/notes/{note_id}').json()
    source = client.get(f'/sources/{note_id}').json()
    transcript = client.get(f'/sources/{note_id}/transcript').json()
    old_file = (NOTES_DIR / f'{note_id}.md').read_text()
    title = '  Fruit: "notes" \\ 維他命  '
    response = client.patch(f'/notes/{note_id}', json={'title': title})
    assert response.status_code == 200, response.text
    assert response.json()['title'] == title.strip()
    assert client.get(f'/notes/{note_id}').json() == {**original, 'title': title.strip()}
    assert client.get(f'/sources/{note_id}').json() == source
    assert client.get(f'/sources/{note_id}/transcript').json() == transcript
    new_file = (NOTES_DIR / f'{note_id}.md').read_text()
    assert new_file.split('\n---\n', 1)[1] == old_file.split('\n---\n', 1)[1]
    assert json.loads(new_file.splitlines()[1].split(': ', 1)[1]) == title.strip()
    assert next(n for n in client.get('/notes').json() if n['id'] == note_id)['title'] == title.strip()
    assert next(n for n in client.get('/graph').json()['nodes'] if n['id'] == note_id)['title'] == title.strip()


@pytest.mark.parametrize('title', ['', '   ', 'bad\nname', 'bad\x00name', 'x' * 201])
def test_invalid_rename_is_rejected(client, title):
    assert client.patch('/notes/missing', json={'title': title}).status_code == 422


def test_delete_cascades_connections_but_keeps_upload_and_other_notes(indexing, client):
    first, second = make_note(client, 'First.pdf'), make_note(client, 'Second.pdf')
    assert wait_index(client, first)['status'] == 'done'
    assert wait_index(client, second)['status'] == 'done'
    client.post(f'/notes/{first}', json={'content': 'Edits', 'blocks': []})
    source = client.get(f'/sources/{first}').json()
    transcript = client.get(f'/sources/{first}/transcript').json()
    raw = client.get(f'/sources/{first}/file').content
    other = client.get(f'/notes/{second}').json()
    async def add_legacy():
        async with SessionLocal() as session:
            session.add(Link(src_id=first, dst_id=second, kind='test'))
            await session.commit()
    client.portal.call(add_legacy)
    response = client.delete(f'/notes/{first}')
    assert response.status_code == 200, response.text
    assert response.json() == {'id': first, 'deleted': True}
    assert client.get(f'/notes/{first}').status_code == 404
    assert client.get(f'/notes/{second}').json() == other
    assert client.get(f'/sources/{first}').json() == source
    assert client.get(f'/sources/{first}/transcript').json() == transcript
    assert client.get(f'/sources/{first}/file').content == raw
    assert not (NOTES_DIR / f'{first}.md').exists()
    assert client.get(f'/jobs/{first}').json()['notes'] == []
    assert all(n['note_id'] != first for n in client.get(f'/notes/{second}/intelligence').json()['related_notes'])
    assert all(first not in [e['src_id'], e['dst_id']] for e in client.get('/graph').json()['edges'])
    async def check():
        async with SessionLocal() as session:
            for model in [NoteDocument, IntelligenceJob, NoteIntelligence]:
                assert await session.get(model, first) is None
            assert not (await session.scalars(select(NoteConcept).where(NoteConcept.note_id == first))).all()
            assert await service.enqueue_missing(session) == 0
    client.portal.call(check)
    assert client.delete(f'/notes/{first}').status_code == 404
    assert client.patch(f'/notes/{first}', json={'title': 'Gone'}).status_code == 404


@pytest.fixture
def slow_indexing(monkeypatch):
    started, release, finished = threading.Event(), threading.Event(), threading.Event()
    async def slow_analysis(content):
        started.set()
        await asyncio.to_thread(release.wait, 10)
        return await fake_analysis(content)
    original_process = service.process
    async def tracked_process(note_id):
        await original_process(note_id)
        finished.set()
    monkeypatch.setattr(settings, 'intelligence_enabled', True)
    monkeypatch.setattr(service, 'analyze', slow_analysis)
    monkeypatch.setattr(service, 'process', tracked_process)
    yield started, release, finished
    release.set()


def test_delete_during_analysis_does_not_recreate_note(slow_indexing, client):
    started, release, finished = slow_indexing
    note_id = make_note(client, 'Delete while indexing.pdf')
    assert started.wait(5)
    try:
        assert client.delete(f'/notes/{note_id}').status_code == 200
    finally:
        release.set()
    assert finished.wait(5)
    client.portal.call(service.process, note_id)
    assert client.get(f'/notes/{note_id}').status_code == 404


def test_filesystem_failure_rolls_back_deletion(client, monkeypatch):
    note_id = make_note(client)
    before = client.get(f'/notes/{note_id}').json()
    original_unlink = Path.unlink
    def blocked(path, *args, **kwargs):
        if path == NOTES_DIR / f'{note_id}.md':
            raise PermissionError('test failure')
        return original_unlink(path, *args, **kwargs)
    monkeypatch.setattr(Path, 'unlink', blocked)
    with pytest.raises(PermissionError):
        client.delete(f'/notes/{note_id}')
    assert client.get(f'/notes/{note_id}').json() == before
    assert (NOTES_DIR / f'{note_id}.md').exists()


def test_rename_and_delete_work_when_export_is_missing(client):
    note_id = make_note(client)
    (NOTES_DIR / f'{note_id}.md').unlink()
    assert client.patch(f'/notes/{note_id}', json={'title': 'Still readable'}).status_code == 200
    assert 'apples' in client.get(f'/notes/{note_id}').json()['content']
    assert client.delete(f'/notes/{note_id}').status_code == 200


def test_legacy_rename_preserves_body_and_metadata():
    assert renamed_markdown('---\ntitle: Old\ntags: [fruit]\n---\n\nBody\n', 'New') == '---\ntitle: "New"\ntags: [fruit]\n---\n\nBody\n'
    assert renamed_markdown('Legacy body', 'New').endswith('\n\nLegacy body')


@pytest.mark.parametrize('method', ['PATCH', 'DELETE'])
def test_browser_can_reach_note_management_endpoints(client, method):
    origin = 'http://localhost:3000'
    preflight = client.options('/notes/missing', headers={
        'Origin': origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'content-type',
    })
    assert preflight.status_code == 200, preflight.text
    assert preflight.headers['access-control-allow-origin'] == origin
    assert method in preflight.headers['access-control-allow-methods']
    response = client.request(method, '/notes/missing', headers={'Origin': origin},
                              **({'json': {'title': 'Test'}} if method == 'PATCH' else {}))
    assert response.status_code == 404
    assert response.headers['access-control-allow-origin'] == origin
    denied = client.options('/notes/missing', headers={
        'Origin': 'https://untrusted.example',
        'Access-Control-Request-Method': method,
    })
    assert denied.status_code == 400
    assert 'access-control-allow-origin' not in denied.headers
