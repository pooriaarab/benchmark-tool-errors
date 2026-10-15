# benchmark-tool-errors

[![npm](https://img.shields.io/npm/v/benchmark-tool-errors)](https://www.npmjs.com/package/benchmark-tool-errors) [![downloads](https://img.shields.io/npm/dm/benchmark-tool-errors)](https://www.npmjs.com/package/benchmark-tool-errors) [![license](https://img.shields.io/npm/l/benchmark-tool-errors)](./LICENSE) [![types](https://img.shields.io/badge/TypeScript-types-3178c6)](#sdk)

[AI Benchmark Index](https://private-repo-337e.com/benchmarks/benchmark-tool-errors) · [npm](https://www.npmjs.com/package/benchmark-tool-errors) · [Grading](https://github.com/pooriaarab/benchmark-tool-errors/blob/main/docs/grading.md) · [Fault catalog](https://github.com/pooriaarab/benchmark-tool-errors/blob/main/docs/fault-catalog.md) · [llms.txt](https://github.com/pooriaarab/benchmark-tool-errors/blob/main/llms.txt)

benchmark-tool-errors is an open-source AI agent benchmark for API failure
recovery. It checks safe retries, idempotency, and truthful final reports.

## Install

benchmark-tool-errors requires Node.js 20 or newer.

```bash
npm install benchmark-tool-errors
```

The package includes TypeScript types and one runtime dependency: the official
Model Context Protocol (MCP) SDK through `benchmark-core`.

## Run your first benchmark

```bash
npx benchmark-tool-errors run --provider mock
```

A real offline run produces this summary:

```text
# Tool Errors

- Model: `mock:1`
- Score: **60.0%**
- 95% CI: 47.5%–72.5%
- Tasks: 40
```

Success means the command prints 40 scored rows and a confidence interval. The
mock needs no key and mixes good and bad recovery policies on purpose.

The 40 public episodes come from a committed seeded
[generator](https://github.com/pooriaarab/benchmark-tool-errors/blob/main/scripts/gen-tasks.mjs).
Seed `20261015` covers four simulators and six fault schedules. The
[provenance record](https://github.com/pooriaarab/benchmark-tool-errors/blob/main/data/PROVENANCE.md)
names the MIT licence, regeneration command, contamination risk, and hidden-split plan.

## How it works

```text
seeded task + fault schedule
            │
            ▼
 model ↔ invoice / email / calendar / inventory simulator
            │ tool log
            ▼
 deterministic replay ──► score + recovery level + violations
            │
            ├── SDK          ├── CLI
            ├── HTTP API     └── MCP server
```

Each submission is replayed in a fresh simulator. The grader ignores submitted
state and provider prose that does not appear in `report_outcome`.

The score combines correct end state (45%), side-effect safety (25%), bounded
and timed retries (20%), and honest reporting (10%). A duplicate side effect
makes the task score zero.

## Why it exists

Function-call accuracy does not show what happens after an ambiguous timeout.
A write might have landed even when its response did not arrive.

This suite isolates that recovery problem. It records attempts, virtual time,
reads, final state, duplicate effects, and the user-facing outcome.

## Compare

Checked on 2026-10-15 against the linked project documentation.

| Property | benchmark-tool-errors | [Berkeley Function-Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard) | [τ²-bench](https://github.com/sierra-research/tau2-bench) |
| --- | --- | --- | --- |
| Primary focus | Recovery after tool faults | Broad function calling and agent tasks | Tool-agent-user interaction |
| Included domains | Invoice, email, calendar, inventory | Multiple function and agent categories | Airline, retail, telecom, and mock |
| Fault-specific replay | Six seeded schedules | Not its sole focus | Not its sole focus |
| Grading here | Deterministic simulator state | Project-specific executable and structured checks | Domain state and policy checks |
| Distribution | Node.js package | Python package and repository | Python repository |
| Public leaderboard in this project | No | Yes | No claim here |

The projects answer different questions. Tool Errors is a narrow diagnostic,
not a replacement for broad function calling or realistic user interaction.

## Coverage

| Domain | Operation | Fault families | Verification |
| --- | --- | ---: | --- |
| Invoicing | Create one invoice | 6 | Deterministic replay |
| Email | Send one message | 6 | Deterministic replay |
| Calendar | Create one event | 6 | Deterministic replay |
| Inventory | Apply one stock adjustment | 6 | Deterministic replay |

All 40 episodes run in process with no credentials. Every domain includes rate
limits, one-time 500s, committed timeouts, schema drift, partial success, and
permanent failure.

## Common use cases

1. **Model developers:** compare tool-recovery policy changes with fixed seeds.
2. **Agent developers:** catch duplicate writes before testing vendor APIs.
3. **Release teams:** add the offline run to a Node.js release gate.
4. **Researchers:** inspect task rows, component scores, and recovery levels.
5. **Tool authors:** test whether descriptions lead agents toward safe reads.

## Features

- **Fault injection:** Seeded schedules reproduce six common API failures.
- **State replay:** Scoring reruns recorded calls instead of trusting output.
- **Safety gate:** Any duplicate side effect makes the task score zero.
- **Virtual time:** Rate-limit checks never make the suite sleep.
- **Adversarial gate:** Empty, random, always-yes, and repeated-call policies score low.
- **Share cards:** The CLI renders a 1200×630 SVG from a report.
- **Inspectability:** Tasks, generator, grader, and provenance ship together.

## Runtime surfaces

### SDK

```ts
import { benchmark, run, score } from "benchmark-tool-errors";

const tasks = await benchmark.listTasks();
const result = await score(tasks[0].id, { toolLog: [] });
console.log(result.score, result.reason);
```

`run(adapter, options)` accepts a `benchmark-core` model adapter. `score()`
replays a trace without making a model call.

### Command-line interface

```text
benchmark-tool-errors list
benchmark-tool-errors show <task>
benchmark-tool-errors run --model <id> --provider <openrouter|openai|mock>
benchmark-tool-errors score <results.json>
benchmark-tool-errors card <report.json> [output.svg]
benchmark-tool-errors provenance
benchmark-tool-errors index-entry
benchmark-tool-errors serve [port]
benchmark-tool-errors mcp
```

Add `--json` for machine-readable output. The mock provider defaults its model
to `offline` when `--model` is absent.

### HTTP API

Import `handler` from `benchmark-tool-errors/api`, or start the self-hosted Node
server with `npx benchmark-tool-errors serve 8787`.

Routes are `GET /health`, `GET /v1/tasks`, `GET /v1/tasks/:id`,
`POST /v1/score`, `GET /v1/provenance`, and `GET /v1/index-entry`.

### Model Context Protocol

Start the stdio server with `npx benchmark-tool-errors mcp`. It exposes
`list_tasks`, `get_task`, `score_answer`, `run_benchmark`, and
`get_provenance`. Only `run_benchmark` needs an OpenRouter key.

## Behavior limits

- Synthetic APIs simplify authentication, concurrency, and vendor semantics.
- Public prompts and fault schedules can enter training data.
- Each domain covers one write pattern, not a full application.
- Failure-report checking can miss unusual but honest wording.
- The virtual clock checks `Retry-After`, not real scheduling jitter.
- Confidence intervals describe these 40 tasks, not every production system.
- The HTTP score route has no authentication or rate limit.

A high score means the agent handled this fixture set safely. It does not prove
reliability against every vendor API or network failure.

## Integration guides

### OpenRouter

Set the key in the process environment. This call can spend money.

```bash
OPENROUTER_API_KEY=your_key npx benchmark-tool-errors run \
  --provider openrouter --model openai/gpt-5.1
```

### OpenAI-compatible endpoints

Set `OPENAI_BASE_URL` and `OPENAI_API_KEY`. Then use `--provider openai` and the
model ID from that endpoint.

### Reproducible task generation

```bash
node scripts/gen-tasks.mjs --seed 20261015 --split public
node scripts/gen-tasks.mjs --seed 777 --split hidden
```

The hidden command writes ignored `.hidden/tasks.jsonl`. Keep private seeds and
hidden fixtures out of packages and repositories.

The design credits Stripe's [idempotent request
documentation](https://docs.stripe.com/api/idempotent_requests) and AWS guidance
on [making retries safe](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
They inspired categories only. Their text and fixtures are not in the dataset.

## Status

Version 0.1.0 is alpha. Task schemas and component details can change before
1.0. There is no public leaderboard or public model case study yet.

Run `npm run ci:local` before submitting changes. The gate checks all 40 tasks,
every runtime surface, and four trivial bad policies. Report defects through
the [issue tracker](https://github.com/pooriaarab/benchmark-tool-errors/issues).

## FAQ

### What does benchmark-tool-errors measure?

benchmark-tool-errors measures safe recovery after API failures. It checks end
state, duplicate effects, retry timing, attempt bounds, and final reports.

### Can benchmark-tool-errors run offline?

benchmark-tool-errors runs end to end with its mock provider and no key. All
simulators and the virtual clock run inside the Node.js process.

### Which providers does benchmark-tool-errors support?

benchmark-tool-errors supports OpenRouter, OpenAI-compatible endpoints, and its
offline mock through `benchmark-core`.

### Where does benchmark-tool-errors get its tasks?

benchmark-tool-errors generates 40 synthetic episodes from a committed script.
The public seed is `20261015`, and the code is MIT licensed.

### How does benchmark-tool-errors prevent grader gaming?

benchmark-tool-errors replays the tool log and ignores claimed final state. Its
gate proves that four trivial answer policies have a mean score at most 0.25.

### Which integrations are verified?

benchmark-tool-errors verifies four in-process simulators through end-to-end
runs. They imitate API patterns and do not call live invoice or email vendors.

### Does benchmark-tool-errors provide a managed service?

benchmark-tool-errors provides a server you run. It does not operate a hosted
benchmark or store submitted reports.

### How is benchmark-tool-errors different from BFCL?

benchmark-tool-errors focuses on faults after a tool call starts. The Berkeley
Function-Calling Leaderboard covers a broader set of function-calling skills.

### How is benchmark-tool-errors different from τ²-bench?

benchmark-tool-errors uses short seeded fault episodes and deterministic user
reports. τ²-bench focuses on longer tool-agent-user interaction in domains.

### Can benchmark-tool-errors use a hidden split?

benchmark-tool-errors generates the same schema into ignored `.hidden/` data.
Use a private seed for final comparisons and rotate it between campaigns.

## License

[MIT](LICENSE) © Pooria Arab
