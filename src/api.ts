import { createHandler } from "benchmark-core";
import { benchmark, createBenchmark } from "./benchmark.js";

// `tasksPath` binds the API to a task file such as a hidden split; the `serve`
// command wires it from `--tasks`.
export function createApiHandler(options: { tasksPath?: string } = {}) {
  return createHandler(options.tasksPath === undefined ? benchmark : createBenchmark(options));
}

export const handler = createApiHandler();
