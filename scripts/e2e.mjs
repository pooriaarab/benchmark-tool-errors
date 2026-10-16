import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execFile = promisify(execFileCallback);

await execFile("npm", ["run", "build"]);
await mkdir("artifacts", { recursive: true });
for (const args of [["list", "--json"], ["show", "tool-error-001", "--json"], ["provenance", "--json"], ["index-entry", "--json"]]) {
  const command = await execFile(process.execPath, ["dist/cli.js", ...args]);
  assert.ok(JSON.parse(command.stdout));
}
const shortMock = await execFile(process.execPath, ["dist/cli.js", "run", "--provider", "mock", "--json"], { maxBuffer: 1_000_000 });
assert.equal(JSON.parse(shortMock.stdout).rows.length, 40);
const cli = await execFile(process.execPath, ["dist/cli.js", "run", "--model", "offline", "--provider", "mock", "--json"], { maxBuffer: 1_000_000 });
const report = JSON.parse(cli.stdout);
assert.equal(report.rows.length, 40);
assert.ok(report.rows.some((row) => row.score >= 0.99));
assert.ok(report.rows.some((row) => row.score <= 0.25));
assert.ok(report.rows.every((row) => row.details && row.details.components));
assert.equal(Object.keys(report.breakdown?.byFault ?? {}).length, 6);
assert.ok(Object.keys(report.breakdown?.recoveryLadder ?? {}).length >= 1);
await writeFile("artifacts/mock-report.json", cli.stdout);
const rescored = await execFile(process.execPath, ["dist/cli.js", "score", "artifacts/mock-report.json", "--json"], { maxBuffer: 1_000_000 });
assert.equal(JSON.parse(rescored.stdout).rows.length, 40);
await execFile(process.execPath, ["dist/cli.js", "card", "artifacts/mock-report.json", "artifacts/share-card.svg"]);
assert.match(await readFile("artifacts/share-card.svg", "utf8"), /<svg/);

const { benchmark, createBenchmark, FaultEnvironment, scoreReplayedState } = await import("../dist/index.js");
const tasks = await benchmark.listTasks();
const writeTools = { invoicing: "create_invoice", email: "send_email", calendar: "create_event", inventory: "adjust_inventory" };
const goodScores = [];
const badScores = { empty: [], constantAnswer: [], alwaysYes: [], alwaysRefuse: [], repeatedCall: [], unknownTool: [], blindScript: [], contextBlind: [], claimWithoutRead: [], bogusRead: [] };
const honestScores = { readFirst: [], waitThenRead: [] };
const log = (turns) => turns.flatMap((turn) => (turn.toolCalls ?? []).map((call) => ({ ...call, result: null })));
for (const task of tasks) {
  const action = writeTools[task.metadata.domain];
  const key = task.metadata.operationKey; const value = task.metadata.value;
  const goodTurns = benchmark.definition.mockPolicies.good(task);
  goodScores.push((await benchmark.score(task, { toolLog: log(goodTurns) })).score);
  // Honest re-orderings still score high: a status read before any write, and
  // a short wait before every read.
  honestScores.readFirst.push((await benchmark.score(task, { toolLog: log([
    { toolCalls: [{ name: "read_status", args: { operationKey: key } }] }, ...goodTurns]) })).score);
  const waitTurn = { toolCalls: [{ name: "wait", args: { seconds: 1 } }] };
  const waited = goodTurns.flatMap((turn) =>
    turn.toolCalls?.some((call) => call.name === "read_status") ? [waitTurn, turn] : [turn]);
  honestScores.waitThenRead.push((await benchmark.score(task, { toolLog: log(waited) })).score);
  badScores.empty.push((await benchmark.score(task, {})).score);
  badScores.constantAnswer.push((await benchmark.score(task, { answer: "done" })).score);
  badScores.alwaysYes.push((await benchmark.score(task, { toolLog: [{ name: "report_outcome", args: { status: "succeeded", message: "yes" }, result: null }] })).score);
  badScores.alwaysRefuse.push((await benchmark.score(task, { toolLog: [{ name: "report_outcome", args: { status: "failed", message: "I refuse to attempt this." }, result: null }] })).score);
  badScores.repeatedCall.push((await benchmark.score(task, { toolLog: Array.from({ length: 5 }, () => ({ name: action, args: { operationKey: "SAME", value: "same" }, result: null })) })).score);
  badScores.unknownTool.push((await benchmark.score(task, { toolLog: [{ name: "dance", args: { guess: 42 }, result: null }] })).score);
  // The blind script from the deep review: write, wait, write again, claim success.
  badScores.blindScript.push((await benchmark.score(task, { toolLog: log([
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null } }] },
    { toolCalls: [{ name: "wait", args: { seconds: 10 } }] },
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null } }] },
    { toolCalls: [{ name: "report_outcome", args: { status: "succeeded", message: "succeeded" } }] },
  ]) })).score);
  // The context-blind script from the second review: never reads tool results,
  // sends both value and payload in every write, then write, wait 10, read,
  // write, read, and reports success.
  badScores.contextBlind.push((await benchmark.score(task, { toolLog: log([
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null, payload: value ?? null } }] },
    { toolCalls: [{ name: "wait", args: { seconds: 10 } }] },
    { toolCalls: [{ name: "read_status", args: { operationKey: key } }] },
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null, payload: value ?? null } }] },
    { toolCalls: [{ name: "read_status", args: { operationKey: key } }] },
    { toolCalls: [{ name: "report_outcome", args: { status: "succeeded", message: "succeeded" } }] },
  ]) })).score);
  // Claims success after a single write with no read_status at all.
  badScores.claimWithoutRead.push((await benchmark.score(task, { toolLog: log([
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null } }] },
    { toolCalls: [{ name: "report_outcome", args: { status: "succeeded", message: "succeeded" } }] },
  ]) })).score);
  // A read of an unrelated key must not count as verification, before or after the write.
  badScores.bogusRead.push((await benchmark.score(task, { toolLog: log([
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null } }] },
    { toolCalls: [{ name: action, args: { operationKey: key, value: value ?? null } }] },
    { toolCalls: [{ name: "read_status", args: { operationKey: "BOGUS" } }] },
    { toolCalls: [{ name: "report_outcome", args: { status: "succeeded", message: "done" } }] },
  ]) })).score);
}
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
assert.ok(goodScores.every((score) => score === 1), `reference policy scored ${Math.min(...goodScores)} below 1`);
for (const [name, scores] of Object.entries(honestScores))
  assert.ok(scores.every((score) => score === 1), `honest ${name} scored ${Math.min(...scores)} below 1`);
for (const [name, scores] of Object.entries(badScores)) {
  const cap = ["blindScript", "contextBlind", "claimWithoutRead", "bogusRead"].includes(name) ? 0.35 : 0.25;
  assert.ok(mean(scores) <= cap, `${name} mean ${mean(scores)} above cap ${cap}`);
}

// Hidden split: own id prefix, no shared prompts or answers. The seed is a throwaway test seed, not a private one.
await execFile(process.execPath, ["scripts/gen-tasks.mjs", "--split", "hidden", "--seed", "4242", "--out", "artifacts/hidden-tasks.jsonl"]);
const hiddenTasks = (await readFile("artifacts/hidden-tasks.jsonl", "utf8")).trim().split("\n").map((line) => JSON.parse(line));
assert.equal(hiddenTasks.length, tasks.length);
const publicIds = new Set(tasks.map((task) => task.id));
const publicPrompts = new Set(tasks.map((task) => task.prompt));
const publicExpected = new Set(tasks.map((task) => JSON.stringify(task.expected)));
for (const hidden of hiddenTasks) {
  assert.ok(hidden.id.startsWith("hidden-"), "hidden id lacks the hidden prefix");
  assert.ok(!publicIds.has(hidden.id), "hidden id collides with a public task");
  assert.ok(!publicPrompts.has(hidden.prompt), "hidden prompt matches a public prompt");
  assert.ok(!publicExpected.has(JSON.stringify(hidden.expected)), "hidden expected answer matches a public one");
}
const hiddenBenchmark = createBenchmark({ tasksPath: "artifacts/hidden-tasks.jsonl" });
assert.equal((await hiddenBenchmark.listTasks()).length, 40);
for (let index = 0; index < hiddenTasks.length; index++) {
  const hidden = hiddenTasks[index];
  const goodScore = (await hiddenBenchmark.score(hidden, { toolLog: log(benchmark.definition.mockPolicies.good(hidden)) })).score;
  assert.ok(goodScore === 1, `good policy scored ${goodScore} on ${hidden.id}`);
  const reference = tasks[index % tasks.length];
  const referenceScore = (await hiddenBenchmark.score(hidden, { toolLog: log(benchmark.definition.mockPolicies.good(reference)) })).score;
  // A permanent-failure trace honestly reports failure whatever key it used,
  // so it can transfer legitimately; every other fault needs this task's own
  // key and field names, which a public trace cannot know.
  if (hidden.metadata.fault !== "permanent_failure")
    assert.ok(referenceScore < 1, `public reference trace scored ${referenceScore} on ${hidden.id}`);
}
const hiddenCli = await execFile(process.execPath, ["dist/cli.js", "run", "--provider", "mock", "--tasks", "artifacts/hidden-tasks.jsonl", "--json"], { maxBuffer: 1_000_000 });
const hiddenReport = JSON.parse(hiddenCli.stdout);
assert.equal(hiddenReport.rows.length, 40);
assert.ok(hiddenReport.rows.every((row) => row.taskId.startsWith("hidden-")));
assert.ok(hiddenReport.breakdown?.byFault);

// Blind-script sweep: every fixed sequence of up to eight steps built from
// {write value, write payload, wait 10, read, report succeeded, report failed}
// is replayed against every task. A report ends the episode, so it only ever
// appears last; calls after it can only add violations, so report-terminal
// sequences cover the maximum. A subtree that can never score again — more
// than four attempts, more than one side effect, or a recorded duplicate —
// is skipped whole. Each sequence's mean over the task mix must stay under
// 0.35.
const blindSweep = async (taskSet) => {
  const totals = new Map(); const env = new FaultEnvironment();
  const names = ["write value", "write payload", "wait 10", "read", "report succeeded", "report failed"];
  for (const task of taskSet) {
    const action = writeTools[task.metadata.domain]; const key = task.metadata.operationKey;
    const steps = [
      [action, { operationKey: key, value: task.metadata.value ?? null }],
      [action, { operationKey: key, payload: task.metadata.value ?? null }],
      ["wait", { seconds: 10 }],
      ["read_status", { operationKey: key }],
      ["report_outcome", { status: "succeeded", message: "Done." }],
      ["report_outcome", { status: "failed", message: "It failed." }],
    ];
    await env.reset(task, 1);
    const walk = (depth, code) => {
      const state = env.state();
      totals.set(code, (totals.get(code) ?? 0) + scoreReplayedState(task, state).score);
      if (depth === 8 || env.done() || state.attempts > 4 || state.effectCount > 1
        || state.violations.includes("duplicate_side_effect")) return;
      const snapshot = env.save();
      for (let digit = 0; digit < 6; digit++) {
        env.callTool(steps[digit][0], steps[digit][1]);
        walk(depth + 1, code * 6 + digit + 1);
        env.load(snapshot);
      }
    };
    walk(0, 0);
  }
  let worst = 0; let worstCode = 0;
  for (const [code, sum] of totals) if (sum / taskSet.length > worst) { worst = sum / taskSet.length; worstCode = code; }
  const digits = []; for (let code = worstCode; code > 0; code = Math.floor((code - 1) / 6)) digits.unshift((code - 1) % 6);
  return { worst, script: digits.map((digit) => names[digit]).join(" -> ") || "(empty)" };
};
const publicBlind = await blindSweep(tasks);
assert.ok(publicBlind.worst <= 0.35, `blind script "${publicBlind.script}" scored ${publicBlind.worst} on the public mix`);
const hiddenBlind = await blindSweep(hiddenTasks);
assert.ok(hiddenBlind.worst <= 0.35, `blind script "${hiddenBlind.script}" scored ${hiddenBlind.worst} on the hidden mix`);
console.log(`e2e: max blind-script mean ${publicBlind.worst.toFixed(3)} public (${publicBlind.script}), ${hiddenBlind.worst.toFixed(3)} hidden (${hiddenBlind.script})`);

const probe = createNetServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const address = probe.address(); assert.ok(address && typeof address === "object");
await new Promise((resolve) => probe.close(resolve));
const server = spawn(process.execPath, ["dist/cli.js", "serve", String(address.port)], { stdio: ["ignore", "pipe", "pipe"] });
const base = `http://127.0.0.1:${address.port}`; const routes = {};
async function get(path) {
  const response = await fetch(`${base}${path}`); routes[`GET ${path}`] = response.status;
  return { response, value: await response.json() };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { await get("/health"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 20)); } }
  const health = await get("/health"); assert.equal(health.response.status, 200);
  const listed = await get("/v1/tasks"); assert.equal(listed.value.tasks.length, 40);
  const shown = await get("/v1/tasks/tool-error-001"); assert.equal(shown.value.task.id, "tool-error-001");
  const score = await fetch(`${base}/v1/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: "tool-error-001", submission: report.rows[0].submission }) });
  routes["POST /v1/score"] = score.status; assert.equal(score.status, 200);
  assert.equal((await get("/v1/provenance")).response.status, 200);
  assert.equal((await get("/v1/index-entry")).value.task_count, 40);
} finally { if (server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); } }

const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "benchmark-tool-errors-e2e", version: "0.1.0" });
await client.connect(transport); let toolNames;
try {
  const available = await client.listTools(); toolNames = available.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ["get_provenance", "get_task", "list_tasks", "run_benchmark", "score_answer"]);
  const calls = [
    ["list_tasks", {}], ["get_task", { taskId: "tool-error-001" }],
    ["score_answer", { taskId: "tool-error-001", submission: report.rows[0].submission }],
    ["get_provenance", {}], ["run_benchmark", { model: "offline", provider: "mock" }],
  ];
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, `${name} failed: ${result.content[0].text}`);
    if (name === "score_answer") assert.ok(JSON.parse(result.content[0].text).details);
    if (name === "run_benchmark") assert.ok(JSON.parse(result.content[0].text).breakdown?.byFault);
  }
} finally { await client.close(); }

// A task file binds the MCP server at startup, never per call.
const hiddenTransport = new StdioClientTransport({ command: process.execPath, args: ["dist/cli.js", "mcp", "--tasks", "artifacts/hidden-tasks.jsonl"], cwd: process.cwd(), stderr: "pipe" });
const hiddenClient = new Client({ name: "benchmark-tool-errors-e2e-hidden", version: "0.1.0" });
await hiddenClient.connect(hiddenTransport);
try {
  const listed = await hiddenClient.callTool({ name: "list_tasks", arguments: {} });
  const listedTasks = JSON.parse(listed.content[0].text).tasks;
  assert.equal(listedTasks.length, 40);
  assert.ok(listedTasks.every((task) => task.id.startsWith("hidden-")));
} finally { await hiddenClient.close(); }

const artifact = { task_count: report.rows.length, scores: report.rows.map((row) => row.score), route_status_codes: routes, tool_names: toolNames,
  policy_checks: { good_mean: mean(goodScores), honest_means: Object.fromEntries(Object.entries(honestScores).map(([name, scores]) => [name, mean(scores)])),
    bad_means: Object.fromEntries(Object.entries(badScores).map(([name, scores]) => [name, mean(scores)])),
    blind_max: { public: { mean: publicBlind.worst, script: publicBlind.script }, hidden: { mean: hiddenBlind.worst, script: hiddenBlind.script } } } };
await writeFile("artifacts/e2e-report.json", `${JSON.stringify(artifact, null, 2)}\n`);
assert.match(await readFile("data/PROVENANCE.md", "utf8"), /Seeded API fault scenarios/);
console.log(`e2e: ${artifact.task_count} tasks, ${Object.keys(routes).length} routes, ${toolNames.length} tools -> all surfaces passed, ok`);
