import { readFile } from "node:fs/promises";
import { defineBenchmark, exactMatch, replay, type Environment, type JsonValue, type Task, type ToolResult } from "benchmark-core";

async function loadTasks(): Promise<Task[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as Task);
}
class StarterEnvironment implements Environment {
  #finished = false;
  reset() {
    this.#finished = false;
    return { system: "Call finish_task once, then stop.", tools: [{ name: "finish_task", description: "Mark the task finished.", parameters: { type: "object" as const, properties: {}, additionalProperties: false } }] };
  }
  callTool(name: string, _args: Record<string, JsonValue>): ToolResult {
    if (name !== "finish_task") return { result: null, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` } };
    this.#finished = true; return { result: { finished: true } };
  }
  state() { return { finished: this.#finished }; }
  done() { return this.#finished; }
}
export const benchmark = defineBenchmark({
  id: "benchmark-tool-errors", name: "Tool Errors", tagline: "Do agents survive real API failures without duplicating side effects?", tags: ["helpful"], category: "tools",
  whatItMeasures: "Do agents survive real API failures without duplicating side effects?", version: "0.1.0", status: "alpha", loadTasks,
  async grade(task, submission, context) {
    if (task.kind === "single") return submission.answer === undefined ? { score: 0, reason: "Submission has no answer." } : exactMatch(task.expected ?? null, submission.answer);
    const state = await replay(new StarterEnvironment(), task, submission.toolLog ?? [], context.seed) as { finished?: boolean };
    return state.finished ? { score: 1, reason: "The trace finished the task." } : { score: 0, reason: "The trace did not finish the task." };
  },
  environment: () => new StarterEnvironment(),
  mockPolicies: {
    good: (task) => task.kind === "episode" ? [{ toolCalls: [{ name: "finish_task", args: {} }] }] : [],
    bad: (task) => task.kind === "episode" ? [{ content: "Skipped the tool." }] : [],
  },
  provenance: [{
    name: "Seeded API fault scenarios", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-tool-errors/blob/main/scripts/gen-tasks.mjs",
    licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root. Run with `--split hidden` to create the untracked hidden split.", retrievedAt: "2026-10-15T00:00:00.000Z",
    contaminationNotes: "The 40 public tasks use seed 20261015 and are visible in the npm package. Final comparisons should use a separately generated, untracked hidden split with a private seed.",
    refresh: "Regenerate and review public fixtures for each minor release; rotate the private hidden seed for every evaluation campaign.",
  }],
  gradingMethod: "Exact match for single answers; deterministic state replay for episodes.",
});
