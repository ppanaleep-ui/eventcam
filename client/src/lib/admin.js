// Host admin token, stored on the creator's device when they make an event.
// Presence of a token is what unlocks host controls (delete, download, rename).

const key = (eventId) => `eventcam.admin.${eventId}`;
const REGISTRY = 'eventcam.myEvents';

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

// A local registry of events this device hosts, so the admin page can list them.
export function getMyEvents() {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY) || '[]');
  } catch {
    return [];
  }
}

export function addMyEvent({ id, token, name }) {
  try {
    setAdminToken(id, token);
    const list = getMyEvents().filter((e) => e.id !== id);
    list.unshift({ id, token, name: name || 'My event', createdAt: Date.now() });
    localStorage.setItem(REGISTRY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

export function updateMyEvent(id, patch) {
  try {
    const list = getMyEvents().map((e) => (e.id === id ? { ...e, ...patch } : e));
    localStorage.setItem(REGISTRY, JSON.stringify(list));
  } catch {}
}

export function removeMyEvent(id) {
  try {
    localStorage.setItem(REGISTRY, JSON.stringify(getMyEvents().filter((e) => e.id !== id)));
    localStorage.removeItem(key(id));
  } catch {}
}
