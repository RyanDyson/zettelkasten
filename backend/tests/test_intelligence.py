import asyncio
import hashlib
import json
import time
import uuid
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.db import SessionLocal
from app.intelligence import pipeline, service
from app.main import app
from app.models import Base, IntelligenceJob, Note, NoteConcept
from test_api import pdf_bytes, upload, wait_job


def vector(name):
    values = [0.0] * 768
    values[int(hashlib.sha256(name.encode()).hexdigest(), 16) % 768] = 1.0
    return values


async def fake_analysis(content):
    names = [name for name in ('apples', 'oranges', 'grapes', 'quantum', 'orchids') if name in content.lower()]
    return {'summary': 'Test summary', 'chunk_count': 1, 'input_hash': pipeline.input_hash(content),
            'concepts': [{'canonical': name, 'aliases': [], 'mentions': [name], 'confidence': 0.9,
                          'embedding': vector(name)} for name in names]}


@pytest.fixture
def indexing(monkeypatch):
    monkeypatch.setattr(settings, 'intelligence_enabled', True)
    monkeypatch.setattr(service, 'analyze', fake_analysis)


def wait_index(client, note_id, desired=('done', 'failed')):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        response = client.get(f'/notes/{note_id}/intelligence')
        assert response.status_code == 200, response.text
        data = response.json()
        if data['status'] in desired:
            return data
        time.sleep(0.02)
    pytest.fail('Index job did not reach expected state')


def make_note(client, text_value, filename='test.pdf'):
    note_id = upload(client, filename, pdf_bytes(text_value))
    assert wait_job(client, note_id)['status'] == 'done'
    return note_id


def test_many_to_many_connections_and_negative_match(indexing, client):
    broad = make_note(client, 'apples oranges grapes', 'fruits.pdf')
    assert wait_index(client, broad)['status'] == 'done'
    apple = make_note(client, 'apples are a fruit', 'apples.pdf')
    assert wait_index(client, apple)['status'] == 'done'
    third = make_note(client, 'apples contain fibre', 'third.pdf')
    result = wait_index(client, third)
    assert {broad, apple} <= {n['note_id'] for n in result['related_notes']}
    assert third in {n['note_id'] for n in client.get(f'/notes/{broad}/intelligence').json()['related_notes']}
    unrelated = make_note(client, 'quantum mechanics', 'physics.pdf')
    assert wait_index(client, unrelated)['status'] == 'done'
    assert not ({broad, apple, third} & {n['note_id'] for n in client.get(f'/notes/{unrelated}/intelligence').json()['related_notes']})
    graph = client.get('/graph').json()
    pairs = [(e['src_id'], e['dst_id']) for e in graph['edges']]
    assert len(pairs) == len(set(pairs))
    assert all(a < b for a, b in pairs)
    assert tuple(sorted([broad, third])) in pairs
    assert client.get('/intelligence/status').json()['worker'] == 'running'


def test_reindex_and_backfill_preserve_note_edits(indexing, client):
    note_id = make_note(client, 'apples contain fibre', 'edit-preservation.pdf')
    assert wait_index(client, note_id)['status'] == 'done'
    original = client.get(f'/sources/{note_id}/transcript').json()
    edit = {'content': 'My own words', 'blocks': [{'type': 'paragraph', 'content': 'My own words'}]}
    assert client.post(f'/notes/{note_id}', json=edit).status_code == 200
    for _ in range(2):
        assert client.post(f'/notes/{note_id}/intelligence/reindex').status_code == 202
        assert wait_index(client, note_id)['status'] == 'done'
    assert client.post('/intelligence/backfill').status_code == 202
    assert client.post('/intelligence/backfill').json()['queued'] == 0
    stored = client.get(f'/notes/{note_id}').json()
    assert stored['content'] == edit['content'] and stored['blocks'] == edit['blocks']
    assert stored['title'] == 'edit-preservation'
    assert client.get(f'/sources/{note_id}/transcript').json() == original
    assert len(client.get(f'/jobs/{note_id}').json()['notes']) == 1
    async def count():
        async with SessionLocal() as s:
            return await s.scalar(select(func.count()).select_from(NoteConcept).where(NoteConcept.note_id == note_id))
    assert client.portal.call(count) == 1


def test_llm_failure_does_not_break_ingestion_and_retry_works(indexing, client, monkeypatch):
    async def failure(content):
        raise pipeline.IntelligenceError('Ollama is offline; retry indexing.')
    monkeypatch.setattr(service, 'analyze', failure)
    note_id = make_note(client, 'oranges contain vitamin C', 'offline.pdf')
    assert wait_index(client, note_id)['status'] == 'failed'
    assert client.get(f'/jobs/{note_id}').json()['status'] == 'done'
    assert client.get(f'/sources/{note_id}/transcript').status_code == 200
    assert client.post(f'/notes/{note_id}', json={'content': 'Still editable'}).status_code == 200
    monkeypatch.setattr(service, 'analyze', fake_analysis)
    assert client.post(f'/notes/{note_id}/intelligence/reindex').status_code == 202
    assert wait_index(client, note_id)['status'] == 'done'
    monkeypatch.setattr(service, 'analyze', failure)
    before = client.get(f'/notes/{note_id}/intelligence').json()
    client.post(f'/notes/{note_id}/intelligence/reindex')
    failed = wait_index(client, note_id)
    assert failed['status'] == 'failed' and failed['summary'] == before['summary']
    assert failed['related_notes'] == before['related_notes']


def test_indexing_resumes_after_shutdown(indexing, database, monkeypatch):
    async def pause(content):
        await asyncio.Event().wait()
    monkeypatch.setattr(service, 'analyze', pause)
    with TestClient(app) as client:
        note_id = make_note(client, 'orchids need water', 'resume.pdf')
        assert wait_index(client, note_id, ('processing',))['status'] == 'processing'
    monkeypatch.setattr(service, 'analyze', fake_analysis)
    with TestClient(app) as client:
        assert wait_index(client, note_id)['status'] == 'done'
        async def attempts():
            async with SessionLocal() as s:
                return (await s.get(IntelligenceJob, note_id)).attempts
        assert client.portal.call(attempts) == 2
        assert len(client.get(f'/jobs/{note_id}').json()['notes']) == 1


def test_existing_notes_backfill_after_enabling(database, monkeypatch):
    monkeypatch.setattr(settings, 'intelligence_enabled', False)
    with TestClient(app) as client:
        note_id = make_note(client, 'grapes are fruit', 'old-vault.pdf')
        assert client.get(f'/notes/{note_id}/intelligence').json()['status'] == 'not_indexed'
        assert client.post('/intelligence/backfill').status_code == 409
    monkeypatch.setattr(settings, 'intelligence_enabled', True)
    monkeypatch.setattr(service, 'analyze', fake_analysis)
    with TestClient(app) as client:
        assert wait_index(client, note_id)['status'] == 'done'
        assert client.post('/intelligence/backfill').json()['queued'] == 0
        assert client.get('/notes/missing/intelligence').status_code == 404
        assert client.post('/notes/missing/intelligence/reindex').status_code == 404


def test_long_text_has_no_truncation_and_model_json_is_validated(monkeypatch):
    monkeypatch.setattr(settings, 'intelligence_chunk_chars', 500)
    source = 'fruit information ' * 400 + 'ZEBRA_FINAL_TOPIC'
    parts = pipeline.chunks(source)
    assert ''.join(parts) == source and len(parts) > 10
    prompts = []
    def respond(request):
        body = json.loads(request.content)
        if request.url.path.endswith('generate'):
            prompts.append(body['prompt'])
            return httpx.Response(200, json={'response': json.dumps({'summary': 'summary', 'concepts': []}), 'done_reason': 'stop'})
        return httpx.Response(200, json={'embedding': vector('test')})
    original = httpx.AsyncClient
    monkeypatch.setattr(pipeline.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(respond), **kw))
    result = asyncio.run(pipeline.analyze(source))
    assert result['chunk_count'] == len(parts)
    assert any('ZEBRA_FINAL_TOPIC' in p for p in prompts)
    async def malformed(*args):
        return {'response': '{"summary":"x","concepts":[{"canonical":"apple","aliases":null}]}'}
    monkeypatch.setattr(pipeline, 'ollama', malformed)
    with pytest.raises(pipeline.IntelligenceError, match='invalid analysis JSON'):
        asyncio.run(pipeline.analyze('apple'))


def test_model_outage_and_wrong_embedding_dimensions_are_explicit(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(pipeline.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(lambda _: httpx.Response(404)), **kw))
    with pytest.raises(pipeline.IntelligenceError, match='model is unavailable'):
        asyncio.run(pipeline.analyze('apples'))
    async def invalid(*args):
        return {'embedding': [0.1, 0.2]}
    monkeypatch.setattr(pipeline, 'ollama', invalid)
    with pytest.raises(pipeline.IntelligenceError, match='768'):
        asyncio.run(pipeline.get_vector(None, 'apples'))


def test_additive_schema_upgrade_keeps_master_records(monkeypatch):
    from conftest import admin_url
    from app import db
    parts = urlsplit(admin_url)
    name = 'zk_upgrade_' + uuid.uuid4().hex
    url = urlunsplit(parts._replace(path='/' + name)).replace('postgresql://', 'postgresql+asyncpg://', 1)
    async def run():
        admin = await asyncpg.connect(admin_url)
        await admin.execute(f'CREATE DATABASE "{name}"')
        engine = create_async_engine(url)
        try:
            monkeypatch.setattr(db, 'engine', engine)
            old = [Base.metadata.tables[n] for n in ('sources', 'notes', 'transcripts', 'note_documents', 'links')]
            async with engine.begin() as conn:
                await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
                await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=old))
                await conn.execute(text("INSERT INTO sources(id,kind,original_name,status) VALUES ('old','pdf','old.pdf','done')"))
                await conn.execute(text("INSERT INTO notes(id,source_id,path,title) VALUES ('old','old','/tmp/old.md','Keep title')"))
                await conn.execute(text("INSERT INTO transcripts(source_id,content,segments,created_at) VALUES ('old','Keep transcript','[]',NOW())"))
                await conn.execute(text("INSERT INTO note_documents(note_id,content,blocks) VALUES ('old','Keep edits','[]')"))
            await db.init_db()
            await db.init_db()
            async with engine.connect() as conn:
                assert await conn.scalar(text("SELECT content FROM transcripts WHERE source_id='old'")) == 'Keep transcript'
                assert await conn.scalar(text("SELECT content FROM note_documents WHERE note_id='old'")) == 'Keep edits'
                assert await conn.scalar(text("SELECT title FROM notes WHERE id='old'")) == 'Keep title'
                assert await conn.scalar(text("SELECT count(*) FROM intelligence_jobs")) == 0
        finally:
            await engine.dispose()
            await admin.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
            await admin.close()
    asyncio.run(run())


def test_stored_alias_resolution_and_failed_refresh_are_atomic(indexing, client, monkeypatch):
    async def aliases(content):
        alias_note = 'alternate' in content
        return {'summary': 'Alias test', 'input_hash': pipeline.input_hash(content), 'chunk_count': 1,
                'concepts': [{'canonical': 'test-orchid-family' if alias_note else 'test-orchidaceae',
                              'aliases': [] if alias_note else ['test-orchid-family'],
                              'mentions': ['orchids'], 'confidence': 0.9,
                              'embedding': vector('different' if alias_note else 'orchidaceae')}]}
    monkeypatch.setattr(service, 'analyze', aliases)
    first = make_note(client, 'orchids botanical name', 'botany.pdf')
    assert wait_index(client, first)['status'] == 'done'
    second = make_note(client, 'orchids alternate name', 'alias.pdf')
    result = wait_index(client, second)
    assert first in {r['note_id'] for r in result['related_notes']}
    assert result['concepts'] == ['test-orchidaceae']
    mention = result['mentions'][0]
    assert mention['concept'] == 'test-orchidaceae'
    assert {'test-orchidaceae', 'test-orchid-family'} <= set(mention['terms'])
    assert 'orchids' not in mention['terms']
    assert first in {n['note_id'] for n in mention['notes']}
    original_persist = service.persist_result
    async def fail_after_writes(session, note_id, data):
        await original_persist(session, note_id, data)
        raise RuntimeError('simulated database-stage failure')
    monkeypatch.setattr(service, 'persist_result', fail_after_writes)
    client.post(f'/notes/{second}/intelligence/reindex')
    failed = wait_index(client, second)
    assert failed['status'] == 'failed'
    assert failed['indexed_at'] == result['indexed_at']
    assert failed['related_notes'] == result['related_notes']
