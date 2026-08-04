// Thin fetch wrapper around the EventCam API.

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

  getEvent(id) {
    return fetch(`/api/events/${id}`).then(json);
  },

  listPhotos(id, { before, limit } = {}) {
    const q = new URLSearchParams();
    if (before) q.set('before', before);
    if (limit) q.set('limit', limit);
    return fetch(`/api/events/${id}/photos?${q}`).then(json);
  },

  // Uploads full + thumbnail blobs produced on the device.
  uploadPhoto(id, { full, thumb, guestName, filter, width, height, onProgress }) {
    const fd = new FormData();
    fd.append('full', full, 'photo.jpg');
    if (thumb) fd.append('thumb', thumb, 'thumb.jpg');
    if (guestName) fd.append('guestName', guestName);
    if (filter) fd.append('filter', filter);
    if (width) fd.append('width', String(width));
    if (height) fd.append('height', String(height));

    // XHR (not fetch) so we can report upload progress on flaky venue wifi.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/events/${id}/photos`);
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

  // ---- Host-only ----
  deletePhoto(id, photoId, token) {
    return fetch(`/api/events/${id}/photos/${photoId}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': token },
    }).then(json);
  },

  // A plain URL so the browser handles the (potentially large) zip download.
  downloadAllUrl(id, token) {
    return `/api/events/${id}/download?token=${encodeURIComponent(token)}`;
  },
};
