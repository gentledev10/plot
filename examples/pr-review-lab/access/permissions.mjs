export function canCheckout(role, ownerMatches, state) {
  if (!['draft', 'pending-approval'].includes(state)) return false;
  if (role === 'admin' || role === 'operations') return true;
  if (state === 'pending-approval') return false;
  return role === 'member' && ownerMatches === true;
}
