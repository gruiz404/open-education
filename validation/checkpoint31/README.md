# Checkpoint 31 · Post-F2 integration readiness

This checkpoint is a non-destructive governance and repository audit. It proves
whether the validated Checkpoint 25–30 chain is structurally ready to proceed to
a full pre-merge regression.

It does not merge branches, change `main`, modify GitHub Pages or baselines,
publish a release, or enable Cycle 4.

## Gate

- Gate: `PASS_F2_INTEGRATION_READINESS_AUDIT`
- Criterion: `LINEAR_CHAIN_ADDITIVE_SCOPE_PROTECTED_MAIN`
- Next gate: `ENABLE_FULL_PRE_MERGE_REGRESSION`
- Recommendation: retain all historical branches and prepare one isolated
  descendant for full-chain regression before any pull request.

## Run locally

```bash
npm test
npm run audit
```

