# Checkpoint 33 · Controlled pull-request preparation

This checkpoint produces an auditable dossier for a possible pull request from the exact CP32
candidate into `main`. It verifies the complete delta, regression evidence, protected scopes,
review conditions and rollback plan.

## Gate

- Gate: `PASS_CONTROLLED_PR_PREPARATION`
- Criterion: `EXACT_CP32_CANDIDATE_ADDITIVE_DELTA_REGRESSION_EVIDENCE_ROLLBACK_READY`
- Next gate: `ENABLE_CONTROLLED_PULL_REQUEST_OPENING_REVIEW`

Passing this checkpoint does not open a pull request, merge to `main`, publish a release, modify
GitHub Pages or released baselines, enable Cycle 4, or delete historical branches.
