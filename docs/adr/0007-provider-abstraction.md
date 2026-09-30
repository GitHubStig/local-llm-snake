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

**Default model: `tev1:latest`**, named by `defaultModel` in
`providers.json` and listed first in the driver dropdown. Every request sends
`"think": false`: omitting it costs 83x on models that think by default.

*Amended 2026-09-23.* The default was `gemma4:e2b`, chosen when it led at the
old level 0. Under the parity prompt (ADR-0012) it starved in every game, and
it has since been removed from the machine. `llama3:latest` was chosen instead.
Its old warning — 2/10 on unambiguous boards, silent truncation above 8k
tokens — was dropped: the 2/10 was measured on a prompt since replaced, and a
parity request is about 430 tokens, far below where it truncates. Under parity
it is weak but alive: 7 food in five games, never crashed ([findings.md](../findings.md) §13).

*Amended 2026-09-30.* The default is now `tev1:latest`, a decision model
(ADR-0014), and `llama3:latest` has been removed from the machine. tev1 is the
only model measured that both keeps up at Normal speed and acts on the facts
([findings.md](../findings.md) §16). It needs Ollama 0.35 or newer. The default
only places a model first in the dropdown and labels it; when it is not
installed, nothing is labelled and the list keeps its usual order.

**Responses are read from `message.content`, falling back to
`message.thinking` when content is empty.** Three lines, harmless for
well-behaved models, and it turns a class of defect from fatal into visible.

**Silent truncation is detected at runtime** by comparing the returned
`prompt_eval_count` against our own token estimate: a lower value means the
model truncated. A pre-flight warning fires when a prompt exceeds a fraction of
the advertised context. Both are needed because the advertised figure cannot be
trusted — see below.

**The browser talks to Ollama directly. `fm serve` goes through a dev-server
proxy** (`/fm` -> `127.0.0.1:1976`), because it rejects any request whose
`Sec-Fetch-Site` is `same-site` or `cross-site` — which every browser sends on a
cross-origin fetch — and has no flag to change it. The proxy makes the
browser's request `same-origin`, which it accepts.

This corrects the original decision, which said both providers could be called
directly and that proxy entries were kept "unused, as an escape hatch". That
was measured with curl, which never sends `Sec-Fetch-Site`; the claim held only
for non-browser clients. The proxy entries were also never actually added until
the first real request failed with a 403.

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

## Model-specific findings

Measurements in [findings.md](../findings.md) §5.

- **`qwen3-vl:4b` is excluded.** `message.content` is empty on every call — the
  schema-constrained JSON is delivered in `message.thinking` instead. It also
  ignores `think: false` when no schema is sent, and with a free-form string
  field it enters a repetition loop at temperature 0 and never terminates
  (exceeded 600s uncapped).
- **`llama3:latest` is a capability limit, not a prompt problem.** 2/10 across
  seven prompt variants, and across 57 trials it never emitted `west` or `left`
  once, though they were correct in 12 of them and offered in the enum every
  time.
- **`llama3:latest` also truncates silently**, returning 200 OK with a
  confidently wrong answer above 8192 tokens, dropping the *middle* of the
  prompt while protecting the opening tokens. Its effective ceiling measured
  4108, not the advertised 8192.
- **`qwen3.8:27b-mlx` stays in the roster** as the honest control. It is
  accurate and fast enough (426ms), and the fact that it does not beat a 5B
  model on accuracy is the demonstration this project exists to make.

## Amendment, 2026-09-21: preloading

`Provider` gained `warm(model)`, called when a model is selected.

A cold Ollama call costs ~2.2s, of which ~2.1s is weight loading. Combined
with continue-straight on a miss (ADR-0001), that meant the first live run
scored 0% controller share and crashed in 7 ticks: the snake was dead before
the first answer arrived. Preloading takes the first real call to ~108ms and
the same run to 57%.

Requests carry `keep_alive: "30m"`, because Ollama's 5 minute default evicts
the model during any pause long enough to actually read the decision panel —
which would reintroduce the cold cost mid-game.

## Consequences

- `fm serve` is not a daemon and must be started manually, so the UI needs an
  offline state. `GET /health` is the probe and is not origin-gated.
- `fm`'s origin allowlist is hardcoded to `localhost` / `127.0.0.1` / `[::1]`
  with no flag, so serving the app from a LAN IP or IPv6 literal breaks it
  unfixably. That is the case the unused proxy config exists for.
- Adding JEV is a `providers.json` entry plus one adapter.
- Heuristic tiers will occasionally misjudge someone's model. Acceptable as
  advisory labels with a stated reason; unacceptable as gates.
