# Tool Errors provenance

This file is generated from the benchmark definition.

## Seeded API fault scenarios

- Kind: `synthetic`
- URL: https://github.com/pooriaarab/benchmark-tool-errors/blob/main/scripts/gen-tasks.mjs
- Licence: `MIT`
- Retrieved: 2026-10-15T00:00:00.000Z
- How to get it: Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root. Run `node scripts/gen-tasks.mjs --split hidden [--out <path>]` to create the untracked hidden split, which defaults to an unpublished seed.
- Contamination notes: The 40 public tasks use seed 20261015 and are visible in the npm package. Final comparisons should use the separately generated, untracked hidden split; its ids, prompts, fault order, and expected answers differ from the public set.
- Refresh: Regenerate and review public fixtures for each minor release; rotate the private hidden seed for every evaluation campaign.
