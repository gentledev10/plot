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

## Updated policy

- Free shipping starts at 30,000 for regular orders and 20,000 for members, including equality.
- Member/coupon discounts combine up to 15%; the payable amount stays non-negative.
- Admin and operations may process draft or pending-approval orders; other members still need ownership and a draft.
- The quantity cap is 20. A stale expected-stock value must fail before changing inventory.
- Retry 429, 5xx, ETIMEDOUT and ECONNRESET up to three attempts. Permanent 4xx rejections stop after one call.
- Audit rejection, retry, reservation rollback, order reuse and completion.
- Existing invalid-input, exact-stock and cart-version isolation contracts remain in force.
