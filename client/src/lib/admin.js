// Host admin token, stored on the creator's device when they make an event.
// Presence of a token is what unlocks host controls (delete, download all).

const key = (eventId) => `eventcam.admin.${eventId}`;

export function getAdminToken(eventId) {
  try {
    return localStorage.getItem(key(eventId)) || '';
  } catch {
    return '';
  }
}

export function setAdminToken(eventId, token) {
  try {
    localStorage.setItem(key(eventId), token);
  } catch {}
}
