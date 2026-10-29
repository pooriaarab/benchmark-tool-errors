# Tool Errors paper

Install with `npm ci`. Run `sh paper/template/reproduce.sh` from the repository root.
Use Node 20+, Python 3, Tectonic, and Poppler (`pdftotext`, `pdfinfo`).
The repeat command builds the package, runs experiments, renders tables, builds the PDF, and verifies evidence.
The output is `paper/tool-errors-paper.pdf`. PDFs, build logs, and the downloaded style stay untracked.
The unchanged pilot template pins the official NeurIPS style archive hash. Its first build needs network access.
Experiments use local scripted adapters with no model requests or credentials.

The study plan precedes saved results. Its deviation log records two aborted adapter runs and their repairs.
`data/` contains raw reports, simulated reports, repeats, summaries, provenance, and verification evidence.
`figures/` contains generated CSV data and vector plot definitions. `generated/` contains generated tables and macros.
Never edit generated results. Repeat the command after any experiment change; record plan changes before affected runs.
The simulated sweep varies omitted status reads. Its confidence intervals resample complete seed-level suites.
Task rates use Wilson intervals. Weighted means use a bootstrap stratified by fault family.
Repeated runs do not enlarge the task sample. Boundary bootstrap intervals can collapse.
The privileged reference and simulated ablations inspect task metadata. The reactive controller reads visible observations only.
No hosted model, human baseline, hidden-set evaluation, external registration, or deployment validation is claimed.
The family paper lists Tool Errors 0.2.0 with 40 synthetic episode tasks. Its scores are not reused here.
Paper text and generated figures use CC-BY-4.0. Benchmark code and tasks retain MIT.
Do not publish or merge this packet automatically. The parent handles release and review.
