import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MAX_TOOL_LOG_ENTRIES, mockAdapter, openrouterAdapter, run as coreRun, type Benchmark, type JsonValue, type ModelAdapter, type Trace } from "benchmark-core";
import { benchmark, enrichReport, type RecoveryTask } from "./benchmark.js";

const tools = [
  { name: "list_tasks", description: "List benchmark task ids and prompts.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_task", description: "Get one benchmark task.", inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"], additionalProperties: false } },
  { name: "score_answer", description: "Score a trace with the deterministic benchmark grader.", inputSchema: { type: "object", properties: { taskId: { type: "string" }, submission: { type: "object" }, seed: { type: "number" } }, required: ["taskId", "submission"], additionalProperties: false } },
  { name: "run_benchmark", description: "Run every task through a model. The default provider is OpenRouter; `mock` runs offline with no key.", inputSchema: { type: "object", properties: { model: { type: "string" }, provider: { type: "string", enum: ["openrouter", "mock"] } }, required: ["model"], additionalProperties: false } },
  { name: "get_provenance", description: "Get benchmark data provenance.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

const content = (value: unknown, isError = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) });
// Task files are bound by the operator at startup (`mcp --tasks`), never by a
// tool caller: a per-call path would let an MCP client read arbitrary files.
export function createMcpServer(bench: Benchmark<RecoveryTask> = benchmark) {
  const server = new Server({ name: bench.definition.id, version: bench.definition.version }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...tools] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const input = (request.params.arguments ?? {}) as Record<string, JsonValue | undefined>;
      if (request.params.name === "list_tasks") return content({ tasks: await bench.listTasks() });
      if (request.params.name === "get_task") {
        if (typeof input.taskId !== "string") return content({ error: "taskId is required." }, true);
        const task = await bench.getTask(input.taskId);
        return task ? content({ task }) : content({ error: "Task not found." }, true);
      }
      if (request.params.name === "score_answer") {
        if (typeof input.taskId !== "string" || !input.submission || typeof input.submission !== "object" || Array.isArray(input.submission))
          return content({ error: "taskId and submission are required." }, true);
        const submittedLog = (input.submission as { toolLog?: unknown }).toolLog;
        if (Array.isArray(submittedLog) && submittedLog.length > MAX_TOOL_LOG_ENTRIES)
          return content({ error: `toolLog may not exceed ${MAX_TOOL_LOG_ENTRIES} entries.` }, true);
        const task = await bench.getTask(input.taskId);
        return task ? content({ taskId: task.id, ...await bench.score(task, input.submission as Trace, typeof input.seed === "number" ? { seed: input.seed } : {}) })
          : content({ error: "Task not found." }, true);
      }
      if (request.params.name === "run_benchmark") {
        if (typeof input.model !== "string") return content({ error: "model is required." }, true);
        const provider = input.provider ?? "openrouter";
        let adapter: ModelAdapter;
        if (provider === "mock") adapter = mockAdapter({ ...bench.definition.mockPolicies ? { policies: bench.definition.mockPolicies } : {} });
        else if (provider === "openrouter") {
          if (!process.env.OPENROUTER_API_KEY) return content({ error: "OPENROUTER_API_KEY is required to run a benchmark." }, true);
          adapter = openrouterAdapter({ model: input.model });
        } else return content({ error: `provider must be openrouter or mock.` }, true);
        return content(await enrichReport(await coreRun(bench, adapter), bench));
      }
      if (request.params.name === "get_provenance") return content({ provenance: bench.definition.provenance });
      return content({ error: `Unknown tool: ${request.params.name}` }, true);
    } catch (caught) {
      return content({ error: caught instanceof Error ? caught.message : "Unknown error." }, true);
    }
  });
  return server;
}

export const startMcp = (bench: Benchmark<RecoveryTask> = benchmark) => createMcpServer(bench).connect(new StdioServerTransport());
