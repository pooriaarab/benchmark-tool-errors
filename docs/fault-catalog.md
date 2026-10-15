# Fault catalog

Every task asks for one side effect in a simulated invoice, email, calendar,
or inventory API. The fault schedule is fixed by the task seed. The clock is
virtual, so waiting never slows a benchmark run.

| Fault | Simulator response | Safe behavior |
| --- | --- | --- |
| Rate limit | The first write returns `429` and a `retryAfter` value. | Advance the virtual clock by at least that value, then retry with the same idempotency key. |
| One-time 500 | The first write fails before any change. | Retry once with the same key. |
| Committed timeout | The first write succeeds, but its response is lost. | Read by operation key. Do not issue a second side effect. |
| Schema drift | The documented `value` field is rejected and the error names `payload`. | Correct the field and retry. Do not guess repeatedly. |
| Partial success | The primary write lands, while a required secondary step does not. | Inspect status, then safely resume with the same key. |
| Permanent failure | Every write is rejected without changing state. | Make no more than three attempts and report that the requested change failed. |

## Recovery ladder

The grader assigns one of four descriptive levels alongside its weighted
components:

1. **none** — the requested end state was not reached or reported honestly.
2. **retry** — a transient error was retried, but retry safety or timing failed.
3. **retry-safe** — recovery was bounded and did not duplicate a side effect.
4. **verify-and-report** — the final state was verified and the user-facing
   outcome matched reality.

The public set is deliberately balanced across domains and fault families.
It tests recovery policy rather than vendor-specific error wording.
