"""Readable source blocks and preview-only draft repair; transcripts stay unchanged."""
import re

LIST = re.compile(r"^\s*(?:[-*•]\s+|\d+[.)]\s+)")
HEADING = re.compile(r"^#{1,3}\s+")


def pdf_blocks(text: str) -> list[dict]:
    blocks = []
    paragraph = []

    def flush():
        if paragraph:
            joined = paragraph[0]
            for line in paragraph[1:]:
                joined += ("" if joined.endswith("-") and line[:1].isalnum() else " ") + line
            blocks.append({"type": "paragraph", "content": joined})
            paragraph.clear()

    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw.strip()
        if not line:
            flush()
        elif LIST.match(line):
            flush()
            marker = LIST.match(line)
            blocks.append({"type": "numberedListItem" if line[0].isdigit() else "bulletListItem",
                           "content": line[marker.end():]})
        elif HEADING.match(line):
            flush()
            level = len(line) - len(line.lstrip('#'))
            blocks.append({"type": "heading", "props": {"level": level}, "content": HEADING.sub('', line)})
        elif line.startswith('> '):
            flush()
            blocks.append({"type": "quote", "content": line[2:]})
        elif (len(line) < 65 and not re.search(r'[.!?,;]$', line)
              and (line.endswith(':') or line.isupper())):
            flush()
            blocks.append({"type": "heading", "props": {"level": 2}, "content": line})
        elif blocks and blocks[-1]['type'] in ('bulletListItem', 'numberedListItem') and not paragraph and raw[:1].isspace():
            blocks[-1]['content'] += ' ' + line
        else:
            paragraph.append(line)
    flush()
    return blocks or [{"type": "paragraph", "content": ""}]


def source_blocks(text: str, kind: str) -> list[dict]:
    if kind not in ('audio', 'video', 'video/audio'):
        return pdf_blocks(text)
    # Whisper's segment boundaries are timestamps, not paragraph boundaries.
    # Keep explicit blank-line separation but let each paragraph wrap naturally.
    return [{'type': 'paragraph', 'content': ' '.join(part.split())}
            for part in re.split(r'\n\s*\n', text.strip()) if part.strip()] or [
                {'type': 'paragraph', 'content': ''}]


def inline_text(content) -> str | None:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return None
    parts = []
    for item in content:
        if not isinstance(item, dict):
            return None
        if item.get('type') == 'text' and isinstance(item.get('text'), str):
            if not isinstance(item.get('styles', {}), dict) or item.get('styles', {}).get('code'):
                return None
            parts.append(item['text'])
        elif item.get('type') == 'link':
            value = inline_text(item.get('content'))
            if value is None:
                return None
            parts.append(value)
        else:
            return None
    return ''.join(parts)


def continuation(left: str, right: str) -> bool:
    left, right = left.rstrip(), right.lstrip()
    if not left or not right or re.search(r'[.!?。！？:;][\s\"\'”’\)\]]*$', left):
        return False
    if LIST.match(right) or HEADING.match(right) or right.startswith('>'):
        return False
    first = right.lstrip('"\'“‘(')[:1]
    return bool(first and (first.islower() or re.match(r"I(?:\s|['’])", right)))


def _slice_inline(items: list[dict], start: int, end: int) -> list[dict]:
    """Slice by text offsets without dropping marks, links or their attributes."""
    import copy
    result = []
    offset = 0
    for item in items:
        value = inline_text([item])
        length = len(value)
        a, b = max(0, start - offset), min(length, end - offset)
        if a < b:
            cloned = copy.deepcopy(item)
            if item['type'] == 'text':
                cloned['text'] = item['text'][a:b]
            else:
                nested = item['content']
                if isinstance(nested, str):
                    cloned['content'] = nested[a:b]
                else:
                    cloned['content'] = _slice_inline(nested, a, b)
            result.append(cloned)
        offset += length
    return result


def reflow_blocks(blocks: list[dict]) -> dict:
    """Explicit draft repair. Join sentence fragments, retaining inline formatting.

    Blank blocks, sentence endings, lists, quotes, headings, code, media, children,
    and different block-level styles are boundaries. Never edit the input objects.
    """
    import copy
    result = []
    repaired = 0

    def eligible(block):
        if block.get('type', 'paragraph') != 'paragraph' or block.get('children'):
            return None
        if not isinstance(block.get('props', {}), dict):
            return None
        return inline_text(block.get('content', ''))

    def props(block):
        return {'textAlignment': 'left', 'textColor': 'default', 'backgroundColor': 'default',
                **block.get('props', {})}

    def items(block):
        value = block.get('content', '')
        return [{'type': 'text', 'text': value, 'styles': {}}] if isinstance(value, str) else value

    for original in blocks:
        block = copy.deepcopy(original)
        value = eligible(block)
        if value is not None:
            edits = []
            for match in re.finditer(r'[ \t]*(?:\r\n|\r|\n)[ \t]*', value):
                a, b = match.span()
                # A blank line is intentional paragraph separation, not a soft wrap.
                if ((a and value[a - 1] in '\r\n') or (b < len(value) and value[b] in '\r\n')):
                    continue
                if continuation(value[:a], value[b:]):
                    edits.append((a, b))
            if edits:
                cursor, content = 0, []
                for a, b in edits:
                    content.extend(_slice_inline(items(block), cursor, a))
                    content.append({'type': 'text', 'text': ' ', 'styles': {}})
                    cursor = b
                content.extend(_slice_inline(items(block), cursor, len(value)))
                block['content'] = content
                repaired += len(edits)
                value = inline_text(content)
        previous = result[-1] if result else None
        before = eligible(previous) if previous else None
        if (before is not None and value is not None and props(previous) == props(block)
                and continuation(before, value)):
            separator = [] if before[-1:].isspace() or value[:1].isspace() else [
                {'type': 'text', 'text': ' ', 'styles': {}}]
            previous['content'] = items(previous) + separator + items(block)
            repaired += 1
        else:
            result.append(block)
    return {'blocks': result, 'repaired_breaks': repaired}
