# Rollback plan for the proposed integration

## Before merge

If any immutable identifier, delta statistic, protection or evidence check changes, do not open
the pull request. Re-run the preparation audit against the new exact candidate.

## After a future merge

If validation-only integration causes an unexpected repository or Actions issue, revert the
single merge commit through a new reviewed pull request. Do not rewrite `main`, force-push, or
delete historical branches. Re-run the relevant contracts after the revert and preserve both the
failed integration evidence and the rollback evidence.

## Recovery point

The protected pre-integration reference is `main` at
`72e4d3410b74f9de4252c93f484304339d71cf1b`.
