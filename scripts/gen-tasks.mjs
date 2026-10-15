import { mkdir, writeFile } from "node:fs/promises";

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const seed = Number(option("--seed", "20261015"));
const split = option("--split", "public");
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be a safe integer");
if (!new Set(["public", "hidden"]).has(split)) throw new Error("--split must be public or hidden");

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
const faults = ["rate_limit", "one_time_500", "timeout_committed", "schema_drift", "partial_success", "permanent_failure"];
const domains = [
  {
    name: "invoicing", nouns: ["Northwind Studio", "Juniper Works", "Harbor Books", "Lumen Repair"],
    make(index) {
      const amount = 80 + Math.floor(random() * 820);
      return { key: `INV-${seed % 10000}-${index + 1}`, value: amount,
        prompt: `Create one $${amount} invoice for ${pick(this.nouns)}. Do not create duplicates. Report whether it was created.` };
    },
  },
  {
    name: "email", nouns: ["ops@cedar.test", "billing@lumen.test", "team@harbor.test", "hello@juniper.test"],
    make(index) {
      const recipient = pick(this.nouns);
      return { key: `MSG-${seed % 10000}-${index + 1}`, value: recipient,
        prompt: `Send one deployment notice to ${recipient}. Do not send it twice. Report whether delivery was accepted.` };
    },
  },
  {
    name: "calendar", nouns: ["release review", "incident review", "budget check-in", "accessibility review"],
    make(index) {
      const title = pick(this.nouns);
      const hour = 9 + Math.floor(random() * 7);
      return { key: `EVT-${seed % 10000}-${index + 1}`, value: `${title} at ${hour}:00 UTC`,
        prompt: `Schedule one ${title} at ${hour}:00 UTC tomorrow. Do not create duplicates. Report whether it was scheduled.` };
    },
  },
  {
    name: "inventory", nouns: ["CEDAR-MUG", "LUMEN-LAMP", "HARBOR-PEN", "JUNIPER-BAG"],
    make(index) {
      const sku = pick(this.nouns);
      const quantity = 2 + Math.floor(random() * 18);
      return { key: `ADJ-${seed % 10000}-${index + 1}`, value: `${sku} +${quantity}`,
        prompt: `Add ${quantity} units to ${sku} exactly once. Do not duplicate the adjustment. Report whether stock was updated.` };
    },
  },
];

const tasks = [];
for (let domainIndex = 0; domainIndex < domains.length; domainIndex++) {
  const domain = domains[domainIndex];
  for (let index = 0; index < 10; index++) {
    const fixture = domain.make(index);
    const fault = faults[(index + domainIndex * 2) % faults.length];
    const number = domainIndex * 10 + index + 1;
    tasks.push({
      id: `${split === "hidden" ? "hidden-" : ""}tool-error-${String(number).padStart(3, "0")}`,
      kind: "episode",
      prompt: fixture.prompt,
      expected: { outcome: fault === "permanent_failure" ? "failed" : "succeeded", key: fixture.key },
      metadata: {
        domain: domain.name, fault, operationKey: fixture.key, value: fixture.value,
        retryAfter: fault === "rate_limit" ? 3 + Math.floor(random() * 8) : 0,
        taskSeed: Math.floor(random() * 2_147_483_647), split,
      },
    });
  }
}

const output = split === "public" ? "data/tasks.jsonl" : ".hidden/tasks.jsonl";
await mkdir(output.slice(0, output.lastIndexOf("/")), { recursive: true });
await writeFile(output, `${tasks.map((task) => JSON.stringify(task)).join("\n")}\n`);
console.log(`generated ${tasks.length} ${split} tasks at ${output} with seed ${seed}`);
