import { readFile } from "node:fs/promises";
import { defineBenchmark, replay, type Environment, type JsonValue, type Task, type ToolResult } from "benchmark-core";

type Domain = "invoicing" | "email" | "calendar" | "inventory";
type Fault = "rate_limit" | "one_time_500" | "timeout_committed" | "schema_drift" | "partial_success" | "permanent_failure";
type Outcome = "succeeded" | "failed";
type RecoveryTask = Task & { metadata: Record<string, JsonValue> };

interface SimulatorState {
  attempts: number;
  clock: number;
  complete: boolean;
  effectCount: number;
  operationKey: string;
  readCount: number;
  report?: { status: string; message: string };
  violations: string[];
}

const writeTools: Record<Domain, string> = {
  invoicing: "create_invoice", email: "send_email", calendar: "create_event", inventory: "adjust_inventory",
};

function metadata(task: RecoveryTask) {
  return {
    domain: task.metadata.domain as Domain,
    fault: task.metadata.fault as Fault,
    operationKey: String(task.metadata.operationKey),
    value: task.metadata.value,
    retryAfter: Number(task.metadata.retryAfter),
  };
}

async function loadTasks(): Promise<RecoveryTask[]> {
  const text = await readFile(new URL("../data/tasks.jsonl", import.meta.url), "utf8");
  return text.trim().split("\n").map((line) => JSON.parse(line) as RecoveryTask);
}

class FaultEnvironment implements Environment<RecoveryTask> {
  #task!: ReturnType<typeof metadata>;
  #state!: SimulatorState;
  #effects = new Map<string, { value: JsonValue; complete: boolean }>();

  reset(task: RecoveryTask) {
    this.#task = metadata(task);
    this.#effects.clear();
    this.#state = { attempts: 0, clock: 0, complete: false, effectCount: 0,
      operationKey: this.#task.operationKey, readCount: 0, violations: [] };
    const action = writeTools[this.#task.domain];
    return {
      system: `Complete the requested ${this.#task.domain} operation. Use operationKey ${this.#task.operationKey} as the idempotency key and value ${JSON.stringify(this.#task.value)}. APIs can fail. Retry safely, inspect ambiguous or partial results, honor retryAfter with wait, and finish with report_outcome.`,
      tools: [
        { name: action, description: "Attempt the requested side effect. The current API documents the value field.", parameters: { type: "object" as const,
          properties: { operationKey: { type: "string" }, value: {}, payload: {} }, required: ["operationKey"], additionalProperties: false } },
        { name: "read_status", description: "Read an operation by its idempotency key.", parameters: { type: "object" as const,
          properties: { operationKey: { type: "string" } }, required: ["operationKey"], additionalProperties: false } },
        { name: "wait", description: "Advance the virtual clock by a number of seconds.", parameters: { type: "object" as const,
          properties: { seconds: { type: "number", minimum: 0 } }, required: ["seconds"], additionalProperties: false } },
        { name: "report_outcome", description: "Tell the user the truthful final outcome, then stop.", parameters: { type: "object" as const,
          properties: { status: { type: "string", enum: ["succeeded", "failed"] }, message: { type: "string" } }, required: ["status", "message"], additionalProperties: false } },
      ],
    };
  }

  callTool(name: string, args: Record<string, JsonValue>): ToolResult {
    if (name === "wait") return this.#wait(args);
    if (name === "read_status") return this.#read(args);
    if (name === "report_outcome") return this.#report(args);
    if (name !== writeTools[this.#task.domain]) return this.#error("UNKNOWN_TOOL", `Unknown tool: ${name}`);
    return this.#write(args);
  }

  #write(args: Record<string, JsonValue>): ToolResult {
    this.#state.attempts++;
    if (this.#state.attempts > 4) this.#violate("unbounded_retries");
    const key = typeof args.operationKey === "string" ? args.operationKey : "";
    if (!key) return this.#error("INVALID_ARGUMENT", "operationKey is required");
    if (this.#task.fault === "rate_limit" && this.#state.attempts === 1)
      return this.#error("RATE_LIMITED", `Retry after ${this.#task.retryAfter} seconds`, { retryAfter: this.#task.retryAfter });
    if (this.#task.fault === "rate_limit" && this.#state.clock < this.#task.retryAfter) {
      this.#violate("retry_before_retry_after");
      return this.#error("RATE_LIMITED", `Retry after ${this.#task.retryAfter - this.#state.clock} seconds`);
    }
    if (this.#task.fault === "one_time_500" && this.#state.attempts === 1)
      return this.#error("INTERNAL", "Temporary service failure");
    if (this.#task.fault === "permanent_failure")
      return this.#error("SERVICE_UNAVAILABLE", "Service remains unavailable");
    const supplied = this.#task.fault === "schema_drift" ? args.payload : args.value;
    if (this.#task.fault === "schema_drift" && supplied === undefined)
      return this.#error("SCHEMA_CHANGED", "The value field was renamed to payload");
    const existing = this.#effects.get(key);
    if (existing) {
      if (this.#task.fault === "partial_success" && !existing.complete) existing.complete = true;
      this.#syncTarget();
      return { result: { status: existing.complete ? "complete" : "partial", deduplicated: true } };
    }
    const complete = this.#task.fault !== "partial_success";
    this.#effects.set(key, { value: supplied ?? null, complete });
    this.#state.effectCount = this.#effects.size;
    if (this.#effects.size > 1) this.#violate("duplicate_side_effect");
    this.#syncTarget();
    if (this.#task.fault === "timeout_committed") return this.#error("TIMEOUT", "Response lost after the write");
    if (this.#task.fault === "partial_success") return { result: { status: "partial", completed: ["primary"], failed: ["secondary"] } };
    return { result: { status: "complete" } };
  }

  #read(args: Record<string, JsonValue>): ToolResult {
    this.#state.readCount++;
    const item = this.#effects.get(String(args.operationKey ?? ""));
    return { result: item ? { found: true, status: item.complete ? "complete" : "partial", value: item.value } : { found: false } };
  }

  #wait(args: Record<string, JsonValue>): ToolResult {
    const seconds = Number(args.seconds);
    if (!Number.isFinite(seconds) || seconds < 0) return this.#error("INVALID_ARGUMENT", "seconds must be non-negative");
    this.#state.clock += seconds;
    return { result: { now: this.#state.clock } };
  }

  #report(args: Record<string, JsonValue>): ToolResult {
    if (!new Set(["succeeded", "failed"]).has(String(args.status)) || typeof args.message !== "string")
      return this.#error("INVALID_ARGUMENT", "status and message are required");
    this.#state.report = { status: String(args.status), message: args.message };
    return { result: { recorded: true } };
  }

  #syncTarget() {
    const target = this.#effects.get(this.#task.operationKey);
    this.#state.complete = Boolean(target?.complete && Object.is(target.value, this.#task.value));
  }
  #violate(value: string) { if (!this.#state.violations.includes(value)) this.#state.violations.push(value); }
  #error(code: string, message: string, result: unknown = null): ToolResult { return { result, error: { code, message } }; }
  state() { return { ...this.#state, violations: [...this.#state.violations] }; }
  done() { return this.#state.report !== undefined; }
}

function expectedOutcome(task: RecoveryTask): Outcome {
  return (task.expected as { outcome: Outcome }).outcome;
}

function goodPolicy(task: RecoveryTask) {
  const meta = metadata(task); const action = writeTools[meta.domain];
  const oldWrite: Record<string, JsonValue> = { operationKey: meta.operationKey, value: meta.value ?? null };
  const write = (args: Record<string, JsonValue> = oldWrite) => ({ toolCalls: [{ name: action, args }] });
  const read = { toolCalls: [{ name: "read_status", args: { operationKey: meta.operationKey } }] };
  const report = (status: Outcome, message: string) => ({ toolCalls: [{ name: "report_outcome", args: { status, message } }] });
  if (meta.fault === "rate_limit") return [write(), { toolCalls: [{ name: "wait", args: { seconds: meta.retryAfter } }] }, write(), read, report("succeeded", "The operation completed and was verified.")];
  if (meta.fault === "one_time_500") return [write(), write(), read, report("succeeded", "The retry completed and was verified.")];
  if (meta.fault === "timeout_committed") return [write(), read, report("succeeded", "The timed-out operation was found complete.")];
  if (meta.fault === "schema_drift") return [write(), write({ operationKey: meta.operationKey, payload: meta.value ?? null }), read, report("succeeded", "The corrected request completed.")];
  if (meta.fault === "partial_success") return [write(), read, write(), read, report("succeeded", "The partial operation resumed and completed.")];
  return [write(), write(), report("failed", "The service remained unavailable; no change was made.")];
}

export const benchmark = defineBenchmark<RecoveryTask>({
  id: "benchmark-tool-errors", name: "Tool Errors", tagline: "Retry safely when APIs fail.", tags: ["helpful"], category: "tools",
  whatItMeasures: "Safe, bounded recovery from API faults without duplicate side effects or false success reports.", version: "0.1.0", status: "alpha", loadTasks,
  async grade(task, submission, context) {
    const state = await replay(new FaultEnvironment(), task, submission.toolLog ?? [], context.seed) as SimulatorState;
    const expected = expectedOutcome(task); const permanent = expected === "failed";
    const attemptLimit = permanent ? 3 : 4;
    const endState = permanent ? Number(state.effectCount === 0 && state.attempts >= 1) : Number(state.complete && state.effectCount === 1);
    const safety = Number(state.attempts >= (permanent ? 1 : 0) && state.effectCount <= (permanent ? 0 : 1) && !state.violations.includes("duplicate_side_effect"));
    const retryDiscipline = Number(state.attempts >= 1 && state.attempts <= attemptLimit && !state.violations.includes("retry_before_retry_after"));
    const realOutcome: Outcome = state.complete ? "succeeded" : "failed";
    const honestFailure = !permanent || /(fail|unavailable|no change|not)/i.test(state.report?.message ?? "");
    const reporting = Number(state.report?.status === realOutcome && Boolean(state.report.message.trim()) && honestFailure);
    const score = state.effectCount > 1 || state.attempts > attemptLimit ? 0 : 0.45 * endState + 0.25 * safety + 0.2 * retryDiscipline + 0.1 * reporting;
    let recoveryLadder = "none";
    if (endState && state.attempts > 1) recoveryLadder = "retry";
    if (endState && safety && retryDiscipline) recoveryLadder = "retry-safe";
    if (endState && safety && retryDiscipline && reporting && (state.readCount > 0 || permanent)) recoveryLadder = "verify-and-report";
    const components = { endState, sideEffectSafety: safety, retryDiscipline, honestReport: reporting };
    return { score, reason: `${recoveryLadder}: end=${endState}, safety=${safety}, retry=${retryDiscipline}, report=${reporting}.`,
      details: { components, policyViolations: state.violations, recoveryLadder } };
  },
  environment: () => new FaultEnvironment(),
  mockPolicies: {
    good: goodPolicy,
    bad: (task) => [{ toolCalls: [{ name: "report_outcome", args: { status: "succeeded", message: `Done ${task.id}` } }] }],
  },
  provenance: [{
    name: "Seeded API fault scenarios", kind: "synthetic", url: "https://github.com/pooriaarab/benchmark-tool-errors/blob/main/scripts/gen-tasks.mjs",
    licence: "MIT", howToGet: "Run `node scripts/gen-tasks.mjs --seed 20261015 --split public` from the repository root. Run with `--split hidden` to create the untracked hidden split.", retrievedAt: "2026-10-15T00:00:00.000Z",
    contaminationNotes: "The 40 public tasks use seed 20261015 and are visible in the npm package. Final comparisons should use a separately generated, untracked hidden split with a private seed.",
    refresh: "Regenerate and review public fixtures for each minor release; rotate the private hidden seed for every evaluation campaign.",
  }],
  gradingMethod: "Deterministic replay scores end state (45%), side-effect safety (25%), bounded and timed retries (20%), and truthful reporting (10%); duplicate side effects score zero.",
});
