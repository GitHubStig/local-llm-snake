# ADR-0007: Provider abstraction and runtime discovery

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

Two local LLM backends today — Ollama and Apple's Foundation Models via
`fm serve` — with a third (JEV) expected. Both current ones are HTTP servers on
localhost.

## Decision

A `Provider` sits beneath the single `ai` controller:

```ts
interface Provider {
  readonly id: string
  health(): Promise<boolean>
  complete<T>(req: {
    system?: string        // byte-identical across ticks; see prefix caching below
    user: string           // per-tick delta only
    schema: object         // plain JSON Schema
    signal?: AbortSignal
  }): Promise<T>
}
```

| Concern | Ollama | `fm serve` |
|---|---|---|
| Endpoint | `http://localhost:11434/api/chat` | `http://127.0.0.1:1976/v1/chat/completions` |
| Schema | top-level `format` | `response_format.json_schema.schema` |
| Streaming | **must send `"stream": false`** (default NDJSON) | **must send `"stream": false`** (default SSE) |
| Determinism | `options.temperature: 0` | `temperature: 0` |
| Parse | `message.content` -> `JSON.parse` | `choices[0].message.content` -> `JSON.parse` |
| Health | `GET /api/version` | `GET /health` |

**The browser talks to both providers directly.** No proxy, no backend. Vite
`server.proxy` entries are kept in config, unused, as an escape hatch.

**Models are discovered at runtime** — `GET /api/tags` and `GET /v1/models` —
never hardcoded. Configuration in `providers.json` holds providers and
classification *rules*, not model names.

The dropdown **labels, never blocks**. Heuristic tiers derived from the API
metadata (`capabilities`, `parameter_size`) are replaced by measured latency
once a model has actually run, and those measurements persist.

## Alternatives considered

**A Vite dev-server proxy**, then **a small Deno server**. Both were
recommended before measurement. Rendered unnecessary: with a real
`Origin: http://localhost:5173` header, Ollama returns
`Access-Control-Allow-Origin` on stock config, and `fm serve` does too. Note
Ollama's own FAQ is incomplete here, claiming only `127.0.0.1` and `0.0.0.0`
are default-allowed when `localhost` on any port and scheme also is.

**`deno desktop`**, to escape CORS and use native bindings instead of HTTP.
Investigated and rejected on two grounds. The premise is false: the page runs
at an ordinary `http://127.0.0.1:<port>` origin under stock WKWebView, and a
CORS-less server was blocked in both the webview and CEF backends, preflight
included. The frontend gets no Deno access (`typeof Deno === "undefined"`); the
only channel is a `bindings` proxy, so a hand-written `llmFetch` binding would
be the same work as a proxy, minus streaming. Separately, `--hmr` is broken for
this stack (denoland/deno#36870, fix an unmerged draft), and the transitive-dep
workaround did not converge with Tailwind 4. Reassess if a distributable `.app`
becomes a goal; packaging is the solid part of that feature, and
`Deno.Command` behind a binding could let the app start `fm serve` itself.

**Native bindings instead of HTTP, generally.** Ollama has no binding — it *is*
an HTTP server. Reaching Apple's Foundation Models without the CLI would mean
writing a Swift dylib. And loopback HTTP overhead is sub-millisecond against
inference measured in hundreds of milliseconds, so it is not in the budget.

**Ollama's OpenAI-compatible `/v1/chat/completions`.** Enforces schemas
identically, but the native response carries `prompt_eval_cached_count`,
`eval_count`, `eval_duration` and `load_duration` — exactly the instrumentation
ADR-0009 needs. The OpenAI shape gives only a coarse `cached_tokens`.

**Hardcoding the model list.** Rejected: it assumes one machine's models.

**Blocking unsuitable models in the dropdown.** Rejected: running a 31B model
and watching it fail is a demonstration the project wants, not an accident to
prevent.

## Consequences

- `fm serve` is not a daemon and must be started manually, so the UI needs an
  offline state. `GET /health` is the probe and is not origin-gated.
- `fm`'s origin allowlist is hardcoded to `localhost` / `127.0.0.1` / `[::1]`
  with no flag, so serving the app from a LAN IP or IPv6 literal breaks it
  unfixably. That is the case the unused proxy config exists for.
- Adding JEV is a `providers.json` entry plus one adapter.
- Heuristic tiers will occasionally misjudge someone's model. Acceptable as
  advisory labels with a stated reason; unacceptable as gates.
