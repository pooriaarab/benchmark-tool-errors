# Working on benchmark-tool-errors

## Commands

- Install with `npm ci`.
- Run the full gate with `npm run ci:local`.
- Generate tasks with `npm run generate:tasks`.
- Generate provenance after building with `npm run provenance`.
- Add no unit tests. Extend `scripts/e2e.mjs` through a public surface.

## Contracts

Keep tasks, deterministic grading, and provenance in sync. Episode environments must be seeded. Grade episode traces by replaying their tool log.

The public suite has 40 episodes across invoicing, email, calendar, and inventory. Preserve all six fault families in `docs/fault-catalog.md`. Update the prewritten failure list in `docs/grading.md` before changing grader behavior. A duplicate side effect must always score zero, and permanent failures require a bounded attempt plus an honest failure report.

`scripts/gen-tasks.mjs --seed N --split public` rewrites the committed data. The `hidden` split belongs in ignored `.hidden/`; never commit a private seed or hidden fixture.

Never read provider keys from repository files. OpenRouter uses `OPENROUTER_API_KEY`. OpenAI-compatible providers use `OPENAI_BASE_URL` and `OPENAI_API_KEY`.

Open an issue before a branch. Use `bter-<issue>-<slug>` and `[bter-<issue>] Imperative subject`. Keep pull requests below 500 counted lines. Do not merge your own pull request or push `release`.
