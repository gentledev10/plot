export function isTransportFailure(error) {
  return error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET';
}

export function paymentFailure(error) {
  return {
    error: isTransportFailure(error) ? 503 : 502,
    reason: isTransportFailure(error) ? 'PAYMENT_UNAVAILABLE' : 'PAYMENT_FAILED',
  };
}
