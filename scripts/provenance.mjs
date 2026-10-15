import { mkdir, writeFile } from "node:fs/promises";
import { provenanceMarkdown } from "benchmark-core";
import { benchmark } from "../dist/index.js";
await mkdir("data", { recursive: true });
await writeFile("data/PROVENANCE.md", provenanceMarkdown(benchmark));
console.log("wrote data/PROVENANCE.md");
