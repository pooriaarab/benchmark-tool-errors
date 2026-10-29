# Tool Errors: study plan

Plan written before any study runs. Source inspection and the accepted honesty layout informed this plan; no honesty data transfer.
No independent registration or venue deposit is made. The first Git commit records ordering only.

## Questions
H1: The packaged reference and a response-aware scripted controller reach full credit on all public episodes.
H2: Empty, constant, echo, refusal, and first-tool controls do not reach full credit.
H3: Removing waits, reads, or reports from reference traces reduces mean score. Report nulls and unaffected fault families.
H4 (simulated): Increasing status-read omission in a simulated population lowers full-credit frequency.
All are diagnostic checks, not tests of trained model competence. No significance threshold or model ranking is planned.

## Design
Use benchmark-tool-errors 0.2.0 at the source commit recorded in config.json, with all 40 public tasks.
Run 12 conditions: packaged-good, packaged-bad, recovery, empty, constant, echo, refuse, first-tool, no-wait, no-read, no-report, redundant-write.
The last four are simulated control ablations of the privileged reference. Redundant-write inserts a write after the final status read.
The response-aware recovery controller uses the visible system request, schema, and tool results, never task fault metadata.
Repeat each condition once. Use runner seed 1, concurrency 1, retries 0, maxTurns 12, maxToolCalls 12, budgetUsd 0.
For the additional simulated population experiment, independently omit each reference read with probability 0, .25, .5, .75, or 1.
Use 20 fixed simulation seeds (1 through 20) shared across probabilities and all public episodes. Run each cell once.
Use a SHA256-derived uniform draw keyed by seed, task ID, and read index. Keep common random draws across probabilities.
Stop after these cells complete. Do not expand the grid based on outcomes. No hosted model calls are planned or configured.

## Measures and analysis
Primary: mean official capped weighted score and fraction of episodes with score exactly 1.
Secondary: four component frequencies, fault-stratified full-credit counts, violation counts, and paired score differences against packaged-good.
Use 95% Wilson intervals for binary episode rates. Use 2000-draw percentile bootstrap intervals for weighted means and paired differences, stratified by fault.
The simulated sweep resamples seed-level suite means, not pooled episode outcomes. Its intervals quantify simulated seed variation only.
Coverage counts describe the fixed suite and need no sampling interval. Repeats prove determinism and do not increase sample size.
Save actual runner reports and traces, repeat semantic hashes, source hashes, summary JSON, and generated figure data.

## Failure cases and exclusions
Before implementation, check: hidden metadata leakage into recovery; malformed output; incorrect field rename; premature retry; unverified timeout; incomplete partial write; false success; false failure; redundant write; unbounded retry; silent completion; incorrect replay; summary drift; accidental paid inference.
No task exclusion is allowed. Empty answers and refusal remain scored. Infrastructure errors abort the study and stay distinct from tool faults.
No human subjects, human ratings, hidden split evaluation, or independent review is claimed. Public tasks are visible and controls are purpose-built.
Publish every planned condition, including nulls. Record changes below before affected runs.

## Deviations
None at registration.
2026-10-29: Initial execution aborted on `Unhandled observation: {"status":"complete"}`. Successful tool messages contain the result directly. Correct the controller parser before rerunning the unchanged grid. No completed study output was saved from this attempt; this is an adapter repair, not an exclusion or a hypothesis change.
2026-10-29: The no-report condition exposed mock-script exhaustion (`Mock policy has no scripted turn`). Append a terminal empty response to scripts, so deliberate silence is scored rather than treated as infrastructure failure. Completed reported episodes still stop at their report. Rerun the unchanged grid; no study output was saved from the aborted attempt.
