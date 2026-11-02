# Behavioral contracts

This is a fictional checkout workflow for testing Plot, not part of the app runtime.

- Public shippingFee rejects negative, missing and non-number amounts.
- Shipping service failure returns 503 before applying any price rule.
- A stock reservation may consume exactly the remaining stock.
- A payment retry is allowed for a temporary provider failure, never for a permanent card rejection.
- Repeating the same cart version returns its saved order without another charge.
- Different cart versions are distinct checkout operations.
- Rejected or failed payments release the full reservation.
- Ownership and order state are checked before reserving inventory or contacting the fake gateway.
