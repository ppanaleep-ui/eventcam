// Personal favourites, stored on the guest's own device (not shared). Lets a
// guest bookmark shots they want to download later.

const key = (eventId) => `eventcam.fav.${eventId}`;

function read(eventId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key(eventId)) || '[]'));
  } catch {
    return new Set();
  }
}
function write(eventId, set) {
  try {
    localStorage.setItem(key(eventId), JSON.stringify([...set]));
  } catch {}
}

export function isFav(eventId, photoId) {
  return read(eventId).has(photoId);
}
export function toggleFav(eventId, photoId) {
  const set = read(eventId);
  if (set.has(photoId)) set.delete(photoId);
  else set.add(photoId);
  write(eventId, set);
  return set.has(photoId);
}
export function favSet(eventId) {
  return read(eventId);
}
