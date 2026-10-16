# Changelog

## 0.2.0 - 2026-10-16

Scoring changed in this release. Scores from 0.1.0 are not comparable with
0.2.0.

- A retry after a committed timeout or a partial result now needs a
  `read_status` first; otherwise it counts as an `unverified_retry` violation.
- Reporting `succeeded` without a prior read counts as `unverified_report`,
  and claiming success on an incomplete operation counts as `false_success`.
- Side-effect safety and retry credit now require the expected end state, so
  never retrying no longer earns that credit on recoverable faults.
- A report that contradicts the replayed outcome — success on an incomplete
  or unverified operation, or failure on a completed one — caps the task at
  0.05. No report, a blind retry, or a guessed schema field caps it at 0.35.
- Each write tool declares exactly one payload field, seeded per task family.
  A drifted API documents a stale name and reveals the live one only through
  a `SCHEMA_CHANGED` error, so a fixed script cannot hard-code it.
- Stored values are compared after normalising case, whitespace, currency
  marks, and string-versus-number form.
- The hidden split now requires a private seed (`--seed` or
  `BTER_HIDDEN_SEED`, never committed) and uses a seeded fault order, wider
  name pools, `H`-tagged operation keys, and its own `hidden-` id prefix.
  `--tasks` (CLI), `tasksPath` (SDK and `createApiHandler`), and `mcp --tasks`
  run a split file.
- Run reports now carry per-row grader details and a `breakdown` with
  per-fault and per-domain means, recovery-ladder counts, component means, and
  policy-violation counts. The bin's `mcp` command now serves the package's
  own MCP server, so `run_benchmark` returns that breakdown and accepts
  `provider: "mock"` for offline runs.

## 0.1.0 - 2026-10-15

Initial public release: 40 seeded recovery episodes, deterministic replay
grader, CLI, SDK, HTTP API, and MCP server.
