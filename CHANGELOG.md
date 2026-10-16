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
- Stored values are compared after normalising case, whitespace, currency
  marks, and string-versus-number form, and the write tool schemas declare
  types for `value` and `payload`.
- The hidden split now requires a private seed (`--seed` or
  `BTER_HIDDEN_SEED`, never committed) and uses a seeded fault order, wider
  name pools, `H`-tagged operation keys, and its own `hidden-` id prefix.
  `--tasks` (CLI), `tasksPath` (SDK and `createApiHandler`), and `mcp --tasks`
  run a split file.
- Run reports now carry per-row grader details and a `breakdown` with
  per-fault and per-domain means, recovery-ladder counts, component means, and
  policy-violation counts.

## 0.1.0 - 2026-10-15

Initial public release: 40 seeded recovery episodes, deterministic replay
grader, CLI, SDK, HTTP API, and MCP server.
