# AGENTS.md

Guidance for coding agents, and for people, working in this repository. It is
short on purpose; follow the links for detail. What the project is and how to
run it is in the [README](README.md).

## Start here

- [`docs/open-threads.md`](docs/open-threads.md) — what is still to build or
  decide. Read it before starting work.
- [`docs/adr/`](docs/adr/README.md) — design decisions, with the alternatives
  that were rejected and why. Check the relevant one before changing a design.
- [`docs/findings.md`](docs/findings.md) — measurements. Numbers quoted anywhere
  else should come from here.
- [`docs/glossary.md`](docs/glossary.md) — the project's terms.

## Before calling anything done

Run all four, and report their actual output:

```sh
npm test
npm run typecheck
npm run lint
npm run fmt:check
```

`fmt:check` is the project's gate. Checking a narrower set of files once hid
17 failures for days.

**Verify UI changes by looking at them** — `npm run shoot`, or a Playwright
probe measuring the element in question — not by reading the emitted CSS. Two
layout bugs in this project were invisible in the CSS and obvious on screen.

## Rules that bite

- **Node runs TypeScript by stripping types.** `enum`, `namespace` and parameter
  properties fail at load. Use `as const` objects and ordinary fields.
- **`src/game/` imports nothing from outside itself**, so its tests need no DOM
  and no network.
- **Tests use `node:test`**, in files named `*.test.ts`.
- **Node is the only runtime** ([ADR-0010](docs/adr/0010-stack-pins-and-runtime.md)).
  Deno and Bun are not supported, so do not add workarounds for them.
- **The prompt must give the model the same information JEV receives**
  ([ADR-0012](docs/adr/0012-single-prompt-matching-jev.md)). Do not add hints
  the JEV request does not have. The direction names are a deliberate,
  recorded exception.
- **Nothing that changes per tick goes in the system prompt**, which must stay
  identical across ticks to be cached. Placeholders belong in the user template.
- **`why` comes after `direction` in the schema.** Placed first, it changed the
  moves and cut food eaten by more than half.
- **Apple's `fm serve` is reached only through the `/fm` dev-server proxy.**
  It rejects cross-origin requests from browsers.

## Measuring models

- `scripts/eval-prompt.ts` measures judgement with no clock and is repeatable at
  temperature 0. `scripts/realtime.ts` drives the real game loop, so its results
  vary with timing. `scripts/prefill-latency.ts` times decision requests of
  increasing length, separating a request's fixed cost from its cost per token.
- Local models are slow and memory-hungry. Run measurements one at a time, and
  check the GPU is idle before timing a run: anything else using it skews the
  latencies. `ioreg -r -d 1 -c IOAccelerator | grep -o '"Device Utilization %"=[0-9]*'`
  shows its current use without `sudo`. The measurement scripts unload every
  model and wait for an idle GPU before each model (`scripts/quiet.ts`).
- When a result contradicts an earlier finding, correct the earlier finding.
  Several findings in this project were overturned by later measurements, and
  the docs say so where it happened.

## Keeping the docs honest

- **Do not describe a feature as existing unless it is in the code.** Docs
  describing unbuilt features as working has been the most common defect here.
- When an open thread is finished, delete it from `docs/open-threads.md` and
  record the outcome in the ADR it belongs to.
- When a decision changes, amend or supersede its ADR rather than editing
  history away.

## Commits

Conventional commit messages — `feat:`, `fix:`, `docs:`, `chore:` — with a body
explaining why, not only what.

**No attribution lines.** Do not credit an AI tool or agent in commit messages
or pull request descriptions: no `Co-Authored-By` trailers naming one, and no
"Generated with …" footers. This applies whichever tool is in use, even if its
own defaults add them.
