import { mkdir, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const split = option("--split", "public");
if (!new Set(["public", "hidden"]).has(split)) throw new Error("--split must be public or hidden");
const PUBLIC_SEED = 20261015;
// The hidden seed is private: pass --seed or set BTER_HIDDEN_SEED, never commit it.
const hiddenSeed = option("--seed", process.env.BTER_HIDDEN_SEED);
if (split === "hidden" && !hiddenSeed) throw new Error("hidden split needs --seed or BTER_HIDDEN_SEED");
const seed = Number(split === "hidden" ? hiddenSeed : option("--seed", String(PUBLIC_SEED)));
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be a safe integer");

function mulberry32(value) {
  return () => {
    value |= 0;
    value = value + 0x6d2b79f5 | 0;
    let output = Math.imul(value ^ value >>> 15, 1 | value);
    output = output + Math.imul(output ^ output >>> 7, 61 | output) ^ output;
    return ((output ^ output >>> 14) >>> 0) / 4294967296;
  };
}

const random = mulberry32(seed + (split === "hidden" ? 1_000_003 : 0));
const pick = (values) => values[Math.floor(random() * values.length)];
const shuffle = (values) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

const faults = ["rate_limit", "one_time_500", "timeout_committed", "schema_drift", "partial_success", "permanent_failure"];
// Each task family draws its write payload field from a small pool. The live
// name is declared by the write tool for ordinary tasks and revealed only by
// a SCHEMA_CHANGED error on schema-drift tasks, so a fixed script cannot
// hard-code it. `value` and `payload` stay in every pool so historical
// guesses still compile into real (often wrong) calls.
const fieldPools = {
  invoicing: ["value", "payload", "amount", "charge", "bill"],
  email: ["value", "payload", "message", "recipient", "body"],
  calendar: ["value", "payload", "event", "title", "booking"],
  inventory: ["value", "payload", "quantity", "stock", "adjustment"],
};
const domains = [
  {
    name: "invoicing", keyPrefix: "INV",
    nouns: ["Northwind Studio", "Juniper Works", "Harbor Books", "Lumen Repair", "Cobalt Pantry", "Ferrotype Labs", "Quill and Pine", "Moss Market"],
    make(index, key) {
      const amount = 60 + Math.floor(random() * 940);
      const client = pick(this.nouns);
      const prompt = pick([
        `Create one $${amount} invoice for ${client} with reference ${key}. Do not create duplicates. Report whether it was created.`,
        `Issue a single invoice of $${amount} to ${client} tagged ${key}. Never bill twice. Report the outcome.`,
      ]);
      return { key, value: amount, prompt };
    },
  },
  {
    name: "email", keyPrefix: "MSG",
    nouns: ["ops@cedar.test", "billing@lumen.test", "team@harbor.test", "hello@juniper.test", "alerts@moss.test", "finance@quill.test", "dev@ferrotype.test", "support@cobalt.test"],
    subjects: ["deployment notice", "maintenance window", "release summary", "policy update", "usage report", "incident recap"],
    make(index, key) {
      const recipient = pick(this.nouns);
      const subject = pick(this.subjects);
      const prompt = pick([
        `Send one ${subject} to ${recipient} using reference ${key}. Do not send it twice. Report whether delivery was accepted.`,
        `Email ${recipient} a single ${subject} tagged ${key}. Send exactly once. Report the delivery outcome.`,
      ]);
      return { key, value: recipient, prompt };
    },
  },
  {
    name: "calendar", keyPrefix: "EVT",
    nouns: ["release review", "incident review", "budget check-in", "accessibility review", "roadmap sync", "vendor demo", "hiring debrief", "uptime retrospective"],
    days: ["tomorrow", "next Monday", "next Tuesday", "next Thursday", "next Friday"],
    make(index, key) {
      const title = pick(this.nouns);
      const hour = 8 + Math.floor(random() * 10);
      const day = pick(this.days);
      const prompt = pick([
        `Schedule one ${title} at ${hour}:00 UTC ${day} with reference ${key}. Do not create duplicates. Report whether it was scheduled.`,
        `Put a single ${title} on the calendar for ${hour}:00 UTC ${day} tagged ${key}. Never book it twice. Report the outcome.`,
      ]);
      return { key, value: `${title} at ${hour}:00 UTC ${day}`, prompt };
    },
  },
  {
    name: "inventory", keyPrefix: "ADJ",
    nouns: ["CEDAR-MUG", "LUMEN-LAMP", "HARBOR-PEN", "JUNIPER-BAG", "COBALT-TIN", "FERRO-GEAR", "QUILL-PAD", "MOSS-TRAY"],
    make(index, key) {
      const sku = pick(this.nouns);
      const quantity = 2 + Math.floor(random() * 18);
      const prompt = pick([
        `Add ${quantity} units to ${sku} exactly once with reference ${key}. Do not duplicate the adjustment. Report whether stock was updated.`,
        `Increase ${sku} stock by ${quantity} units one time tagged ${key}. No double counting. Report the outcome.`,
      ]);
      return { key, value: `${sku} +${quantity}`, prompt };
    },
  },
];

const drafted = [];
// Hidden keys carry an H so they can never collide with public keys, whatever seed is chosen.
const keyTag = split === "hidden" ? `H${seed % 100000}` : `${seed % 100000}`;
for (const domain of domains) {
  const schedule = shuffle([...faults, pick(faults), pick(faults), pick(faults), pick(faults)]);
  const pool = fieldPools[domain.name];
  for (let index = 0; index < 10; index++) {
    const key = `${domain.keyPrefix}-${keyTag}-${index + 1}`;
    const payloadField = pick(pool);
    // Drifted APIs keep documenting a stale name that differs from the live one.
    const staleField = schedule[index] === "schema_drift" ? pick(pool.filter((name) => name !== payloadField)) : payloadField;
    drafted.push({ domain: domain.name, fault: schedule[index], payloadField, staleField, fixture: domain.make(index, key) });
  }
}
const ordered = split === "hidden" ? shuffle(drafted) : drafted;
const tasks = ordered.map((entry, position) => ({
  id: `${split === "hidden" ? "hidden-tool-error" : "tool-error"}-${String(position + 1).padStart(3, "0")}`,
  kind: "episode",
  prompt: entry.fixture.prompt,
  expected: { outcome: entry.fault === "permanent_failure" ? "failed" : "succeeded", key: entry.fixture.key },
  metadata: {
    domain: entry.domain, fault: entry.fault, operationKey: entry.fixture.key, value: entry.fixture.value,
    payloadField: entry.payloadField, staleField: entry.staleField,
    retryAfter: entry.fault === "rate_limit" ? 3 + Math.floor(random() * 8) : 0,
    taskSeed: Math.floor(random() * 2_147_483_647), split,
  },
}));

const output = option("--out", split === "public" ? "data/tasks.jsonl" : ".hidden/tasks.jsonl");
await mkdir(output.slice(0, Math.max(output.lastIndexOf("/"), 0)) || ".", { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks at ${output}${split === "hidden" ? "" : ` with seed ${seed}`}`);
