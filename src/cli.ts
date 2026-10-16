#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { bootstrapCI, createCli, mockAdapter, openaiCompatAdapter, openrouterAdapter, renderMarkdown, run as coreRun, type ModelAdapter, type RunReport, type RunRow } from "benchmark-core";
import { benchmark, breakdownMarkdown, createBenchmark, enrichReport, summarize, type RecoveryTask } from "./benchmark.js";

const bin = "benchmark-tool-errors";
const args = process.argv.slice(2);

// --tasks <path> binds every command to a task file such as a hidden split.
const tasksIndex = args.indexOf("--tasks");
const tasksPath = tasksIndex === -1 ? undefined : args[tasksIndex + 1];
const forwarded = tasksIndex === -1 ? args : [...args.slice(0, tasksIndex), ...args.slice(tasksIndex + 2)];
if (tasksIndex !== -1 && tasksPath === undefined) { console.error("--tasks needs a task file path."); process.exit(1); }
const bench = tasksPath === undefined ? benchmark : createBenchmark({ tasksPath });
if (forwarded[0] === "run" && forwarded[forwarded.indexOf("--provider") + 1] === "mock" && !forwarded.includes("--model")) forwarded.push("--model", "offline");
const json = forwarded.includes("--json");
const rest = forwarded.slice(1).filter((arg) => arg !== "--json");

function adapter(provider: string | undefined, model: string | undefined, seed: number): ModelAdapter {
  if (provider === "mock") return mockAdapter({ seed, ...bench.definition.mockPolicies ? { policies: bench.definition.mockPolicies } : {} });
  if (provider === "openrouter") return openrouterAdapter({ model: model ?? "" });
  if (provider === "openai") return openaiCompatAdapter({ model: model ?? "" });
  throw new Error("--provider must be openrouter, openai, or mock.");
}

async function main(): Promise<number> {
  if (forwarded[0] === "run" || forwarded[0] === "score") {
    if (forwarded[0] === "run") {
      const parsed = parseArgs({ args: rest, options: { model: { type: "string" }, provider: { type: "string" }, concurrency: { type: "string" },
        timeout: { type: "string" }, retries: { type: "string" }, seed: { type: "string" }, "max-turns": { type: "string" },
        "max-tool-calls": { type: "string" }, budget: { type: "string" } }, strict: true });
      const model = parsed.values.model; const provider = parsed.values.provider;
      if (!model || !provider) throw new Error("run needs --model and --provider.");
      const seed = Number(parsed.values.seed ?? 1);
      const result = await coreRun(bench, adapter(provider, model, seed), { seed,
        ...parsed.values.concurrency ? { concurrency: Number(parsed.values.concurrency) } : {},
        ...parsed.values.timeout ? { timeoutMs: Number(parsed.values.timeout) } : {},
        ...parsed.values.retries ? { retries: Number(parsed.values.retries) } : {},
        ...parsed.values["max-turns"] ? { maxTurns: Number(parsed.values["max-turns"]) } : {},
        ...parsed.values["max-tool-calls"] ? { maxToolCalls: Number(parsed.values["max-tool-calls"]) } : {},
        ...parsed.values.budget ? { budgetUsd: Number(parsed.values.budget) } : {} });
      const enriched = await enrichReport(result, bench);
      console.log(json ? JSON.stringify(enriched) : `${renderMarkdown(enriched)}\n${breakdownMarkdown(enriched.breakdown)}`);
      return result.rows.some((row) => row.error) ? 2 : 0;
    }
    const file = rest[0];
    if (!file) throw new Error("score needs a results JSON file.");
    const original = JSON.parse(await readFile(file, "utf8")) as RunReport;
    if (!Array.isArray(original?.rows)) throw new Error("File is not a run report.");
    const rows = [] as RunRow[];
    for (const row of original.rows) {
      const task = await bench.getTask(row.taskId) as RecoveryTask | undefined;
      if (!task || row.submission === undefined) throw new Error(`Cannot score task ${row.taskId}.`);
      const grade = await bench.score(task, row.submission, { seed: original.seed });
      rows.push(grade.details === undefined ? { ...row, score: grade.score, reason: grade.reason }
        : { ...row, score: grade.score, reason: grade.reason, details: grade.details } as RunRow);
    }
    const scores = rows.map((row) => row.score);
    const rescored = { ...original, rows, mean: scores.reduce((a, b) => a + b, 0) / scores.length, confidenceInterval95: bootstrapCI(scores, original.seed) };
    const enriched = { ...rescored, breakdown: summarize(rows, [...await bench.listTasks()]) };
    console.log(json ? JSON.stringify(enriched) : `${renderMarkdown(enriched)}\n${breakdownMarkdown(enriched.breakdown)}`);
    return 0;
  }
  return createCli(bench, { bin }).main(forwarded);
}

try {
  process.exitCode = await main();
} catch (caught) {
  console.error(caught instanceof Error ? caught.message : String(caught));
  console.error(`Usage: ${bin} <list|show|run|score|card|provenance|index-entry|serve|mcp> [--tasks <path>] [options]`);
  process.exitCode = 1;
}
