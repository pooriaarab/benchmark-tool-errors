#!/usr/bin/env node
import { createCli } from "benchmark-core";
import { benchmark } from "./benchmark.js";
const args = process.argv.slice(2);
if (args[0] === "run" && args.includes("mock") && !args.includes("--model")) args.push("--model", "offline");
process.exitCode = await createCli(benchmark, { bin: "benchmark-tool-errors" }).main(args);
