# Checkpoint 32 · Full pre-merge regression

This checkpoint re-executes the complete Chromium validation chain before any
pull request is considered. Five isolated jobs run Checkpoints 25–29, and one
final job audits their fresh evidence together with the immutable contracts of
Checkpoints 30–32.

## Gate

- Gate: `PASS_FULL_PRE_MERGE_REGRESSION`
- Criterion: `CP25_CP30_FULL_CHAIN_22_CASES_410_CHECKS_CONFORM`
- Next gate: `ENABLE_CONTROLLED_PULL_REQUEST_PREPARATION`

Passing this gate does not open a pull request, merge to `main`, publish a
release, modify GitHub Pages or baselines, or enable Cycle 4.

