# Plot PR review lab: checkout policy change

This draft PR is a fictional review exercise for Plot. It changes only this isolated
example and its test workflow. The app runtime does not import the example.
All orders, stores and payment responses are in memory; no real charge or network call occurs.

## Change intent

1. Lower free shipping to 30,000 for regular orders and 20,000 for members.
2. Add member/coupon discounts, capped at 15%.
3. Let operations staff process pending approvals; ordinary users still need ownership.
4. Support up to 20 items, reject stale stock and roll back reservations on payment failure.
5. Retry temporary payment failures up to three times, with audit events.
6. Preserve idempotency within the same cart version and isolation across versions.

The public shipping helper must still reject negative amounts. A reservation may consume
exactly the available stock. Permanent 4xx rejections must not be retried (429 is transient).
Review the implementation against these contracts and the tests.

## Try it in Plot

Generate the AI overview, explore purpose-based reading units, compare the flowcharts,
change scalar inputs, ask about selected code, run independent checks, and compare actual
before/after Node test results. This exercise includes intentional regressions; its isolated
lab check is expected to fail. Do not merge this draft as a product change.

```sh
node --test --test-isolation=none examples/pr-review-lab/tests/*.test.mjs
```

Plot runs the PR-head assertions against both code versions. A baseline failure can also
represent a new requirement; compare named tests rather than only the exit codes.
