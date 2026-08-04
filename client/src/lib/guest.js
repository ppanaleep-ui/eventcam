// A guest's display name, remembered on their own device. Deliberately
// lightweight — no accounts, no login, just a name so the album can show who
// snapped what.

const KEY = 'eventcam.guestName';

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
