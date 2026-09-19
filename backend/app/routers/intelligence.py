import asyncio
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import select

from ..db import SessionLocal
from ..intelligence import run_intelligence_pipeline
from ..models import Note

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


class IntelligencePreviewRequest(BaseModel):
    text: str


@router.post("/preview")
async def preview_intelligence(payload: IntelligencePreviewRequest):
    async with SessionLocal() as session:
        result = await run_intelligence_pipeline(payload.text, session)
    return result


async def _read_text(path: str) -> str:
    return await asyncio.to_thread(Path(path).read_text, "utf-8")


@router.get("/library")
async def list_library_documents(limit: int = 30):
    async with SessionLocal() as session:
        rows = await session.execute(
            select(
                Note.id,
                Note.title,
                Note.tags,
                Note.keywords,
                Note.summary,
                Note.path,
                Note.source_id,
                Note.created_at,
            )
            .order_by(Note.created_at.desc())
            .limit(max(1, min(limit, 100)))
        )

    items = []
    for row in rows:
        content = ""
        if row.path:
            try:
                content = await _read_text(row.path)
            except Exception:
                content = ""
        items.append(
            {
                "id": row.id,
                "source_id": row.source_id,
                "title": row.title,
                "tags": (row.tags or "").split(",") if row.tags else [],
                "keywords": (row.keywords or "").split(",") if row.keywords else [],
                "summary": row.summary or "",
                "content": content,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return {"count": len(items), "items": items}


@router.get("/playground", response_class=HTMLResponse)
async def intelligence_playground():
    return """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Intelligence Playground</title>
  <style>
    :root {
      --bg: #f7f4eb;
      --ink: #1d2a31;
      --card: #fffdf7;
      --accent: #116466;
      --accent-soft: #2c8f92;
      --border: #d9d2bc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at 8% 8%, #f2e8c8 0%, transparent 30%),
                  radial-gradient(circle at 100% 0%, #d7efe6 0%, transparent 25%),
                  var(--bg);
      min-height: 100vh;
      padding: 24px;
    }
    .shell {
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .hero {
      background: linear-gradient(130deg, var(--accent), var(--accent-soft));
      color: #f9fffc;
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 8px 28px rgba(17, 100, 102, 0.24);
    }
    .hero h1 { margin: 0 0 6px; font-size: 1.4rem; }
    .hero p { margin: 0; opacity: 0.95; }
    .panes {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    @media (min-width: 980px) {
      .panes { grid-template-columns: 1fr 1fr; }
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 6px 20px rgba(50, 50, 50, 0.06);
    }
    .panel h2 { margin: 0 0 10px; font-size: 1rem; }
    textarea {
      width: 100%;
      min-height: 320px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid var(--border);
      padding: 12px;
      font-size: 0.95rem;
      line-height: 1.5;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      background: #fff;
      color: var(--ink);
    }
    .actions {
      margin-top: 12px;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    button:hover { filter: brightness(1.05); }
    .ghost {
      background: #edf4f4;
      color: var(--ink);
      border: 1px solid var(--border);
    }
    #status { font-size: 0.9rem; opacity: 0.85; }
    pre {
      margin: 0;
      border-radius: 10px;
      background: #0f1720;
      color: #d6e2f2;
      padding: 12px;
      min-height: 390px;
      overflow: auto;
      font-size: 0.82rem;
      line-height: 1.45;
      font-family: "JetBrains Mono", "SFMono-Regular", Menlo, monospace;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <h1>Intelligence Pipeline Playground</h1>
      <p>Paste raw transcript text and inspect the exact JSON contract returned by <code>run_intelligence_pipeline</code>.</p>
    </section>
    <section class="panes">
      <article class="panel">
        <h2>Input Document</h2>
        <textarea id="doc" placeholder="Paste document text here..."></textarea>
        <div class="actions">
          <button id="run">Run Intelligence</button>
          <button id="sample" class="ghost">Insert Sample</button>
          <button id="clear" class="ghost">Clear</button>
          <span id="status">Idle.</span>
        </div>
      </article>
      <article class="panel">
        <h2>Engine Contract Response</h2>
        <pre id="out">{}</pre>
      </article>
    </section>
  </main>
  <script>
    const docEl = document.getElementById("doc");
    const outEl = document.getElementById("out");
    const statusEl = document.getElementById("status");

    document.getElementById("sample").addEventListener("click", () => {
      docEl.value = "Retrieval augmented generation combines vector search with language models. We used PostgreSQL and LangChain to improve context retrieval quality while tracking latency budgets.";
      statusEl.textContent = "Sample inserted.";
    });

    document.getElementById("clear").addEventListener("click", () => {
      docEl.value = "";
      outEl.textContent = "{}";
      statusEl.textContent = "Cleared.";
    });

    document.getElementById("run").addEventListener("click", async () => {
      const text = docEl.value.trim();
      if (!text) {
        statusEl.textContent = "Please paste some text first.";
        return;
      }
      statusEl.textContent = "Running intelligence pipeline...";
      outEl.textContent = "{\n  \"loading\": true\n}";
      try {
        const response = await fetch("/intelligence/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        const payload = await response.json();
        outEl.textContent = JSON.stringify(payload, null, 2);
        statusEl.textContent = response.ok ? "Done." : "Request failed.";
      } catch (err) {
        outEl.textContent = JSON.stringify({ error: String(err) }, null, 2);
        statusEl.textContent = "Request failed.";
      }
    });
  </script>
</body>
</html>
"""


@router.get("/react-playground", response_class=HTMLResponse)
async def intelligence_react_playground():
    return """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>React Intelligence Playground</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; color: #13212b; }
    #root { max-width: 1100px; margin: 0 auto; }
    .panel { background: #fff; border: 1px solid #d5dce2; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 980px) { .grid { grid-template-columns: 1fr 1fr; } }
    textarea { width: 100%; min-height: 260px; border: 1px solid #d5dce2; border-radius: 8px; padding: 10px; }
    button { border: 0; border-radius: 8px; background: #0d7a6f; color: #fff; padding: 8px 12px; cursor: pointer; margin-right: 6px; }
    pre { background: #111a23; color: #d9e7f3; border-radius: 8px; padding: 10px; min-height: 240px; max-height: 500px; overflow: auto; }
    .logs { background: #101418; color: #b8f2da; border-radius: 8px; padding: 8px; min-height: 120px; max-height: 240px; overflow: auto; white-space: pre-wrap; }
    .status { margin-left: 8px; color: #5f6d79; font-size: 0.9rem; }
    .list { max-height: 260px; overflow: auto; border: 1px solid #d5dce2; border-radius: 8px; }
    .item { padding: 8px 10px; border-bottom: 1px solid #e8edf1; cursor: pointer; }
    .item:last-child { border-bottom: 0; }
    .item:hover { background: #f1f6f8; }
    .item small { display: block; color: #5f6d79; margin-top: 2px; }
  </style>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    (function () {
      if (!window.React || !window.ReactDOM) {
        var fallback = document.getElementById('root');
        fallback.innerHTML = '<div class="panel"><h2>React CDN failed to load</h2><p>Open /intelligence/playground as fallback.</p></div>';
        return;
      }

      var e = React.createElement;

      function App() {
        var state = React.useState('');
        var text = state[0];
        var setText = state[1];

        var state2 = React.useState({});
        var result = state2[0];
        var setResult = state2[1];

        var state3 = React.useState('Idle');
        var status = state3[0];
        var setStatus = state3[1];

        var state4 = React.useState(['UI ready.']);
        var logs = state4[0];
        var setLogs = state4[1];

        var state5 = React.useState([]);
        var docs = state5[0];
        var setDocs = state5[1];

        function pushLog(msg) {
          var line = new Date().toLocaleTimeString() + '  ' + msg;
          setLogs(function (prev) {
            return prev.slice(-120).concat([line]);
          });
        }

        async function loadLibrary() {
          pushLog('GET /intelligence/library');
          try {
            var response = await fetch('/intelligence/library?limit=50');
            var payload = await response.json();
            setDocs(payload.items || []);
            pushLog('Library loaded: ' + ((payload.items || []).length) + ' docs');
          } catch (err) {
            pushLog('Library load error: ' + String(err));
          }
        }

        async function run() {
          var value = text.trim();
          if (!value) {
            pushLog('No text entered.');
            setStatus('Need input text');
            return;
          }
          var started = performance.now();
          setStatus('Sending request...');
          pushLog('POST /intelligence/preview');
          setResult({ loading: true });
          try {
            var response = await fetch('/intelligence/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: value })
            });
            pushLog('Response status: ' + response.status);
            var payload = await response.json();
            setResult(payload);
            var ms = Math.round(performance.now() - started);
            setStatus(response.ok ? ('Done in ' + ms + ' ms') : ('Failed in ' + ms + ' ms'));
          } catch (err) {
            setResult({ error: String(err) });
            setStatus('Request error');
            pushLog('Error: ' + String(err));
          }
        }

        function sample() {
          setText('We discussed retrieval augmented generation with PostgreSQL and LangChain. Semantic chunking improved relevance and reduced latency.');
          pushLog('Inserted sample text.');
        }

        React.useEffect(function () {
          loadLibrary();
        }, []);

        return e('div', null,
          e('div', { className: 'panel' },
            e('h2', null, 'React Intelligence Playground'),
            e('p', null, 'Paste text, run pipeline, inspect logs and JSON output.')
          ),
          e('div', { className: 'grid' },
            e('div', { className: 'panel' },
              e('h3', null, 'Input'),
              e('textarea', {
                value: text,
                onChange: function (ev) { setText(ev.target.value); },
                placeholder: 'Paste document text here...'
              }),
              e('div', { style: { marginTop: '8px' } },
                e('button', { onClick: run }, 'Run Intelligence'),
                e('button', { onClick: sample }, 'Sample'),
                e('button', { onClick: function () { setText(''); setResult({}); setStatus('Cleared'); pushLog('Cleared.'); } }, 'Clear'),
                e('span', { className: 'status' }, status)
              ),
              e('h3', { style: { marginTop: '10px' } }, 'Live Logs'),
              e('div', { className: 'logs' }, logs.join('\\n'))
            ),
            e('div', { className: 'panel' },
              e('h3', null, 'Knowledge Base Documents'),
              e('div', { className: 'list' },
                docs.length === 0
                  ? e('div', { className: 'item' }, 'No stored docs yet.')
                  : docs.map(function (doc) {
                      return e('div', {
                        key: doc.id,
                        className: 'item',
                        onClick: function () {
                          setText(doc.content || '');
                          pushLog('Loaded doc into input: ' + doc.title);
                        }
                      },
                        e('strong', null, doc.title || doc.id),
                        e('small', null, 'id: ' + doc.id),
                        e('small', null, 'tags: ' + (doc.tags || []).slice(0,4).join(', '))
                      );
                    })
              ),
              e('div', { style: { marginTop: '8px' } },
                e('button', { onClick: loadLibrary }, 'Refresh Library')
              ),
              e('h3', { style: { marginTop: '10px' } }, 'JSON Response'),
              e('pre', null, JSON.stringify(result, null, 2))
            )
          )
        );
      }

      ReactDOM.createRoot(document.getElementById('root')).render(e(App));
    })();
  </script>
</body>
</html>
"""
