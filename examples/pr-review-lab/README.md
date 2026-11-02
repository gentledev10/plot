# Plot PR review lab

A fictional, dependency-free checkout module used to exercise Plot's real PR review.
It uses only in-memory stores and a fake payment gateway. No network or real payment occurs.

The workflow is request → permission → price/shipping quote → inventory reservation → fake payment → order storage.
Every module is independent of Plot's production runtime.

Run the Node built-in tests from the repository root:

```sh
node --test --test-isolation=none examples/pr-review-lab/tests/*.test.mjs
```

The baseline supports one payment attempt, ordinary members/admins, five items per order,
and a free-shipping threshold of 50,000 (30,000 for members).
