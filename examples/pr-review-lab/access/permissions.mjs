export function canCheckout(role, ownerMatches, state) {
  if (state !== 'draft') return false;
  if (role === 'admin') return true;
  return role === 'member' && ownerMatches === true;
}
