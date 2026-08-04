// Thin fetch wrapper around the EventCam API.
import { getGuestId } from './guest.js';

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  createEvent({ name, hostName }) {
    return fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, hostName }),
    }).then(json);
  },

  getEvent(id, token) {
    const headers = token ? { 'x-admin-token': token } : {};
    return fetch(`/api/events/${id}`, { headers }).then(json);
  },

  listPhotos(id, { before, limit, token } = {}) {
    const q = new URLSearchParams();
    if (before) q.set('before', before);
    if (limit) q.set('limit', limit);
    const headers = { 'x-guest-id': getGuestId() };
    if (token) headers['x-admin-token'] = token;
    return fetch(`/api/events/${id}/photos?${q}`, { headers }).then(json);
  },

  // Uploads full media (photo or video) + a thumbnail/poster produced on device.
  uploadMedia(id, { full, thumb, guestName, filter, kind, width, height, duration, hidden, onProgress }) {
    const fd = new FormData();
    const fullName = kind === 'video' ? 'clip' : 'photo';
    fd.append('full', full, `${fullName}`);
    if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
    if (guestName) fd.append('guestName', guestName);
    if (filter) fd.append('filter', filter);
    if (width) fd.append('width', String(width));
    if (height) fd.append('height', String(height));
    if (duration) fd.append('duration', String(duration));
    if (hidden) fd.append('hidden', '1');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/events/${id}/photos`);
      xhr.setRequestHeader('x-guest-id', getGuestId());
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fd);
    });
  },

  qrUrl(id) {
    return `/api/events/${id}/qr`;
  },

  // ---- likes / comments ----
  toggleLike(id, photoId) {
    return fetch(`/api/events/${id}/photos/${photoId}/like`, {
      method: 'POST',
      headers: { 'x-guest-id': getGuestId() },
    }).then(json);
  },
  listComments(id, photoId) {
    return fetch(`/api/events/${id}/photos/${photoId}/comments`).then(json);
  },
  addComment(id, photoId, { text, name }) {
    return fetch(`/api/events/${id}/photos/${photoId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-id': getGuestId() },
      body: JSON.stringify({ text, name }),
    }).then(json);
  },

  // ---- Delete (owner or host) ----
  // Sends both the guest id (owner) and, if present, the admin token (host).
  deletePhoto(id, photoId, token) {
    const headers = { 'x-guest-id': getGuestId() };
    if (token) headers['x-admin-token'] = token;
    return fetch(`/api/events/${id}/photos/${photoId}`, { method: 'DELETE', headers }).then(json);
  },

  // ---- Host-only ----
  renameEvent(id, name, token) {
    return fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ name }),
    }).then(json);
  },

  deleteEvent(id, token) {
    return fetch(`/api/events/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': token },
    }).then(json);
  },

  downloadAllUrl(id, token) {
    return `/api/events/${id}/download?token=${encodeURIComponent(token)}`;
  },
};
