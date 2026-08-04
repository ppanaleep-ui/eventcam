// A guest's display name, remembered on their own device. Deliberately
// lightweight — no accounts, no login, just a name so the album can show who
// snapped what.

const KEY = 'eventcam.guestName';
const ID_KEY = 'eventcam.guestId';

// A stable, anonymous device id so a guest can delete their own uploads.
// Random and opaque — not tied to any personal info.
export function getGuestId() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id =
        (crypto?.randomUUID && crypto.randomUUID()) ||
        `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

export function getGuestName() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setGuestName(name) {
  try {
    localStorage.setItem(KEY, name.trim().slice(0, 60));
  } catch {}
}
