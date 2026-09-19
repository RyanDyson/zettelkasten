import asyncio
import copy
import json

import pytest

from app.intelligence import formatting
from app.intelligence.pipeline import IntelligenceError
from app.note_layout import pdf_blocks
from test_api import upload, pdf_bytes, wait_job


def test_pdf_reflow_preserves_paragraphs_and_structural_lines():
    text = 'Vitamin C supports the\nimmune system and helps with\nhealing.\n\nFOOD SOURCES\n- Oranges\n- Red peppers\n  and broccoli\n\nAnother paragraph.\nStill here.'
    blocks = pdf_blocks(text)
    assert blocks == [
        {'type': 'paragraph', 'content': 'Vitamin C supports the immune system and helps with healing.'},
        {'type': 'heading', 'props': {'level': 2}, 'content': 'FOOD SOURCES'},
        {'type': 'bulletListItem', 'content': 'Oranges'},
        {'type': 'bulletListItem', 'content': 'Red peppers and broccoli'},
        {'type': 'paragraph', 'content': 'Another paragraph. Still here.'},
    ]
    assert pdf_blocks('long-\nterm effects')[0]['content'] == 'long-term effects'
    assert pdf_blocks('Keep x - y unchanged.')[0]['content'] == 'Keep x - y unchanged.'
    assert pdf_blocks('Use <script>alert(1)</script>')[0]['content'] == 'Use <script>alert(1)</script>'


def test_format_plan_cannot_drop_reorder_or_invent_text():
    units = ['Vitamin C helps.', ' Keep this sentence.']
    for groups in [
        [{'start': 1, 'end': 1, 'type': 'paragraph'}],
        [{'start': 0, 'end': 0, 'type': 'paragraph'}],
        [{'start': 0, 'end': 2, 'type': 'paragraph'}],
    ]:
        with pytest.raises(IntelligenceError):
            formatting.apply_plan(units, formatting.Plan(groups=groups), {})
    plan = formatting.Plan(groups=[{'start': 0, 'end': 1, 'type': 'quote', 'bold': ['Vitamin C', 'invented'], 'highlight': ['helps']}])
    result = formatting.apply_plan(units, plan, {})
    assert result[0]['type'] == 'paragraph'  # Cannot invent a quotation.
    assert ''.join(item['text'] for item in result[0]['content']) == ''.join(units)
    assert result[0]['content'][0] == {'type': 'text', 'text': 'Vitamin C', 'styles': {'bold': True}}


def test_formatting_preserves_rich_content_and_covers_all_chunks(monkeypatch):
    requests = []
    async def model(_client, _endpoint, payload):
        units = json.loads(payload['prompt'].split('SOURCE UNITS:\n')[1])
        requests.extend(u['text'] for u in units)
        return {'response': json.dumps({'groups': [{'start': 0, 'end': len(units) - 1,
            'type': 'paragraph', 'bold': ['Vitamin C'], 'highlight': []}]})}
    monkeypatch.setattr(formatting, 'ollama', model)
    text = 'Vitamin C matters. ' * 400 + 'FINAL PHRASE'
    rich = {'id': 'rich', 'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Manual bold', 'styles': {'bold': True}}]}
    media = {'id': 'media', 'type': 'image', 'props': {'url': '/local/image'}, 'children': []}
    blocks = [{'id': 'original', 'type': 'paragraph', 'content': text}, rich, media]
    before = copy.deepcopy(blocks)
    result = asyncio.run(formatting.format_blocks(blocks))
    assert ''.join(requests) == text
    assert ''.join(i['text'] for b in result['blocks'][:-2] for i in b['content']) == text
    assert result['blocks'][-2:] == [rich, media]
    assert result['blocks'][0]['id'] == 'original'
    assert blocks == before


def test_format_preview_is_read_only_and_errors_are_explicit(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, 'intelligence_enabled', True)
    note_id = upload(client, 'format.pdf', pdf_bytes())
    wait_job(client, note_id)
    original = client.get(f'/notes/{note_id}').json()
    transcript = client.get(f'/sources/{note_id}/transcript').json()
    async def model(*args):
        return {'response': json.dumps({'groups': [{'start': 0, 'end': 0, 'type': 'paragraph', 'bold': ['Vitamin C']}]})}
    monkeypatch.setattr(formatting, 'ollama', model)
    draft = {'blocks': [{'type': 'paragraph', 'content': 'Vitamin C matters.'}]}
    response = client.post(f'/notes/{note_id}/format-preview', json=draft)
    assert response.status_code == 200, response.text
    assert response.json()['blocks'][0]['content'][0]['styles'] == {'bold': True}
    assert client.get(f'/notes/{note_id}').json() == original
    assert client.get(f'/sources/{note_id}/transcript').json() == transcript
    async def malformed(*args):
        return {'response': 'not valid json'}
    monkeypatch.setattr(formatting, 'ollama', malformed)
    assert client.post(f'/notes/{note_id}/format-preview', json=draft).status_code == 502
    assert client.post('/notes/missing/format-preview', json=draft).status_code == 404
    assert client.post(f'/notes/{note_id}/format-preview', json={'blocks': [{'content': 'x' * 120001}]}).status_code == 413
    monkeypatch.setattr(settings, 'intelligence_enabled', False)
    assert client.post(f'/notes/{note_id}/format-preview', json=draft).status_code == 409


def test_saved_blocks_and_source_text_are_not_reformatted(client):
    note_id = upload(client, 'source.pdf', pdf_bytes())
    wait_job(client, note_id)
    note = client.get(f'/notes/{note_id}').json()
    assert note['blocks'][0]['type'] == 'paragraph'
    assert note['content'] == client.get(f'/sources/{note_id}/transcript').json()['content']
    edit = {'content': 'A deliberate\nline break.', 'blocks': [{'type': 'paragraph', 'content': 'A deliberate\nline break.'}]}
    client.post(f'/notes/{note_id}', json=edit)
    assert client.get(f'/notes/{note_id}').json()['blocks'] == edit['blocks']


def test_invalid_plan_retries_with_bounded_ids_without_partial_changes(monkeypatch):
    calls = []
    async def model(_client, _endpoint, payload):
        calls.append(payload)
        last = 20 if len(calls) == 1 else 1
        return {'response': json.dumps({'groups': [{'start': 0, 'end': last, 'type': 'paragraph', 'bold': ['Vitamin C']}]})}
    monkeypatch.setattr(formatting, 'ollama', model)
    original = [{'type': 'paragraph', 'content': 'Vitamin C matters. Keep everything.'}]
    result = asyncio.run(formatting.format_blocks(original))
    assert len(calls) == 2
    assert calls[0]['format']['$defs']['Group']['properties']['end']['enum'] == [0, 1]
    assert ''.join(item['text'] for item in result['blocks'][0]['content']) == original[0]['content']


@pytest.mark.parametrize('kind', ['audio', 'video', 'video/audio'])
def test_transcription_segments_are_not_paragraphs(kind):
    from app.note_layout import source_blocks
    assert source_blocks("People don't\nhave to work.\nA new sentence.\n\nAnother paragraph.", kind) == [
        {'type': 'paragraph', 'content': "People don't have to work. A new sentence."},
        {'type': 'paragraph', 'content': 'Another paragraph.'},
    ]


def test_repair_preserves_rich_spans_links_edits_and_input():
    from app.note_layout import reflow_blocks, inline_text
    blocks = [
        {'id': 'first', 'type': 'paragraph', 'content': [{'type': 'text', 'text': "People don't", 'styles': {'bold': True}}]},
        {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'have to work for ', 'styles': {}}, {'type': 'link', 'href': 'https://example.com', 'content': [{'type': 'text', 'text': 'sossjsmeone.', 'styles': {'backgroundColor': 'yellow'}}]}]},
        {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'This new sentence has\na soft wrap.', 'styles': {'italic': True}}]},
    ]
    before = copy.deepcopy(blocks)
    result = reflow_blocks(blocks)
    assert result['repaired_breaks'] == 2
    assert [inline_text(b['content']) for b in result['blocks']] == ["People don't have to work for sossjsmeone.", 'This new sentence has a soft wrap.']
    assert result['blocks'][0]['id'] == 'first'
    assert result['blocks'][0]['content'][0] == blocks[0]['content'][0]
    assert result['blocks'][0]['content'][-1] == blocks[1]['content'][-1]
    assert result['blocks'][1]['content'][0]['styles'] == {'italic': True}
    assert blocks == before
    assert reflow_blocks(result['blocks']) == {'blocks': result['blocks'], 'repaired_breaks': 0}


@pytest.mark.parametrize('boundary', [
    {'type': 'heading', 'content': 'a heading'},
    {'type': 'bulletListItem', 'content': 'a list'},
    {'type': 'quote', 'content': 'a quote'},
    {'type': 'codeBlock', 'content': 'some code'},
    {'type': 'image', 'props': {'url': '/image.png'}},
    {'type': 'paragraph', 'content': ''},
    {'type': 'paragraph', 'content': 'a child', 'children': [{'type': 'paragraph', 'content': 'nested'}]},
    {'type': 'paragraph', 'props': {'textAlignment': 'center'}, 'content': 'centered'},
    {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'inline code', 'styles': {'code': True}}]},
])
def test_repair_respects_structural_boundaries(boundary):
    from app.note_layout import reflow_blocks
    blocks = [{'type': 'paragraph', 'content': 'A sentence fragment'}, boundary]
    assert reflow_blocks(blocks) == {'blocks': blocks, 'repaired_breaks': 0}


def test_repair_preserves_sentence_endings_and_explicit_blank_lines():
    from app.note_layout import reflow_blocks
    blocks = [{'type': 'paragraph', 'content': 'Keep this.\nNew sentence.\n\nseparate thought'},
              {'type': 'paragraph', 'content': 'Another paragraph.'}]
    assert reflow_blocks(blocks) == {'blocks': blocks, 'repaired_breaks': 0}


def test_layout_preview_repairs_current_draft_without_model_or_writes(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, 'intelligence_enabled', False)
    note_id = upload(client, 'repair.pdf', pdf_bytes())
    wait_job(client, note_id)
    original = client.get(f'/notes/{note_id}').json()
    transcript = client.get(f'/sources/{note_id}/transcript').json()
    draft = {'blocks': [{'type': 'paragraph', 'content': 'My edited words'}, {'type': 'paragraph', 'content': 'continue here.'}]}
    response = client.post(f'/notes/{note_id}/layout-preview', json=draft)
    assert response.status_code == 200, response.text
    assert response.json()['repaired_breaks'] == 1
    assert client.get(f'/notes/{note_id}').json() == original
    assert client.get(f'/sources/{note_id}/transcript').json() == transcript
    assert client.post('/notes/missing/layout-preview', json=draft).status_code == 404
    assert client.post(f'/notes/{note_id}/layout-preview', json={'blocks': [{'content': 'x' * 120001}]}).status_code == 413


def test_formatter_receives_repaired_paragraphs(monkeypatch):
    from app.note_layout import inline_text
    requests = []
    async def model(_client, _endpoint, payload):
        units = json.loads(payload['prompt'].split('SOURCE UNITS:\n')[1])
        requests.append(''.join(unit['text'] for unit in units))
        return {'response': json.dumps({'groups': [{'start': 0, 'end': len(units) - 1, 'type': 'paragraph'}]})}
    monkeypatch.setattr(formatting, 'ollama', model)
    result = asyncio.run(formatting.format_blocks([
        {'type': 'paragraph', 'content': "People don't"},
        {'type': 'paragraph', 'content': 'have to work.'},
    ]))
    assert requests == ["People don't have to work."]
    assert inline_text(result['blocks'][0]['content']) == requests[0]
    assert result['repaired_breaks'] == 1
