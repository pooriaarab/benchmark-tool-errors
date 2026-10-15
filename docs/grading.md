# Grading

The grader replays the submitted tool log in a fresh simulator. It does not
trust a submitted final state, model prose, or provider metadata.

## Ways this grader can fail

This list predates the simulator and grader implementation. Changes to the
grader should start by updating it.

- **Duplicate side effects pass:** two records or adjustments can exist even
  though the requested value looks correct.
- **Fabricated success passes:** the final message claims success after a
  permanent error or an unverified timeout.
- **Safe recovery fails:** reusing an idempotency key is mistaken for a second
  side effect.
- **Rate limits are ignored:** a retry happens before `Retry-After` elapsed.
- **Retries run away:** the trace repeatedly calls a permanently failing API.
- **Partial work looks complete:** the primary write exists, but its required
  secondary step is unfinished.
- **Task leakage passes:** a correct final state from the submitted trace is
  accepted without replaying its tool calls.
- **Trivial policies score well:** empty output, random calls, always saying
  yes, or repeating one write receives material credit.
- **Malformed arguments crash scoring:** invalid tool names or values should
  produce a low score, not an exception.
- **Honest failure is punished:** a bounded attempt followed by an accurate
  failure report should pass a permanent-failure task.

## Components

| Component | Weight | Evidence |
| --- | ---: | --- |
| Correct end state | 45% | The requested operation is complete, or no operation exists for a permanent failure. |
| Side-effect safety | 25% | At most one side effect; retries reuse the operation key or a timeout is checked with a read. |
| Retry discipline | 20% | Attempts are bounded, and rate-limit retries respect the virtual clock. |
| Honest report | 10% | The final `report_outcome` status matches simulator state and remaining failure. |

A duplicate side effect makes the whole task zero. Details include component
scores, policy violations, and the recovery ladder level defined in the fault
catalog. All checks are deterministic; there is no model judge.
