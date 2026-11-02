export const policy = Object.freeze({
  shipping: { standardFree: 50_000, memberFree: 30_000, fee: 3_000 },
  pricing: { memberPercent: 5, couponPercent: 0, maxPercent: 5 },
  inventory: { maxPerOrder: 5 },
  payment: { maxAttempts: 1 },
});
