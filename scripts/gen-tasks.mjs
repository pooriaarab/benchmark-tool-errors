import { mkdir, writeFile } from "node:fs/promises";
const prompts = ["Call finish_task once, then stop.", "Use finish_task to complete this task."];
const tasks = ["ready", "set"].map((expected, index) => ({ id: `starter-${index + 1}`, kind: "episode", prompt: prompts[index], expected, metadata: { seed: 20261015 + index } }));
await mkdir("data", { recursive: true });
await writeFile("data/tasks.jsonl", `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} seeded tasks`);
