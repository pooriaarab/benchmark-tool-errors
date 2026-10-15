import { createHandler } from "benchmark-core";
import { benchmark } from "./benchmark.js";
export const handler = createHandler(benchmark);
