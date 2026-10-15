import { createMcpServer as create, startMcp as start } from "benchmark-core";
import { benchmark } from "./benchmark.js";
export const createMcpServer = () => create(benchmark);
export const startMcp = () => start(benchmark);
