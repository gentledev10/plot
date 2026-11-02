export const policy = Object.freeze({
  shipping: { standardFree: 30_000, memberFree: 20_000, fee: 3_000 },
  pricing: { memberPercent: 10, couponPercent: 5, maxPercent: 15 },
  inventory: { maxPerOrder: 20 },
  payment: { maxAttempts: 3 },
});
