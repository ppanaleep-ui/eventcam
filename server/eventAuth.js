// Shared per-event authorization helpers (used by both event and photo routes).

export function adminToken(req) {
  return req.get('x-admin-token') || req.query.token || '';
}

// Opaque per-device guest id — lets a guest manage/hide their own uploads.
export function ownerId(req) {
  return (req.get('x-guest-id') || req.body?.guestId || '').toString().slice(0, 40);
}

// Host = holds the event's admin token, OR is the signed-in account that owns
// it, OR is the site owner.
export function isHost(req, event) {
  const t = adminToken(req);
  if (t && event.admin_token && t === event.admin_token) return true;
  if (req.user) {
    if (event.owner_user_id && event.owner_user_id === req.user.id) return true;
    if (req.user.role === 'owner') return true;
  }
  return false;
}
