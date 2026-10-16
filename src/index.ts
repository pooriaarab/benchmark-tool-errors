import { run as runBenchmark, type ModelAdapter, type RunOptions, type Trace } from "benchmark-core";
import { benchmark, createBenchmark, enrichReport } from "./benchmark.js";
export { benchmark, createBenchmark, enrichReport, summarize, breakdownMarkdown, loadTasks } from "./benchmark.js";
export type { RecoveryBreakdown } from "./benchmark.js";

// `tasksPath` runs a task file such as a generated hidden split instead of the
// packaged public tasks.
export async function run(adapter: ModelAdapter, options?: RunOptions & { tasksPath?: string }) {
  const bench = options?.tasksPath === undefined ? benchmark : createBenchmark({ tasksPath: options.tasksPath });
  return enrichReport(await runBenchmark(bench, adapter, options), bench);
}

export async function score(taskId: string, submission: Trace, options: { tasksPath?: string; seed?: number } = {}) {
  const bench = options.tasksPath === undefined ? benchmark : createBenchmark({ tasksPath: options.tasksPath });
  const task = await bench.getTask(taskId); if (!task) throw new Error(`Task not found: ${taskId}`);
  return bench.score(task, submission, options.seed === undefined ? {} : { seed: options.seed });
}
