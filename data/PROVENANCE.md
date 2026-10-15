# Tool Errors provenance

This file is generated from the benchmark definition.

## Seeded API fault scenarios

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-tool-errors/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root. Run with `--split hidden` to create the untracked hidden split.
- Contamination notes: The 40 public tasks use seed 20261015 and are visible in the npm package. Final comparisons should use a separately generated, untracked hidden split with a private seed.
- Refresh: Regenerate and review public fixtures for each minor release; rotate the private hidden seed for every evaluation campaign.
