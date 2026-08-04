// Auth + account API. Cookies are same-origin and sent automatically.

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(json);

export const authApi = {
  me: () => fetch('/api/auth/me').then(json),
  register: (payload) => post('/api/auth/register', payload),
  login: (payload) => post('/api/auth/login', payload),
  logout: () => post('/api/auth/logout'),

  // owner-only
  listUsers: () => fetch('/api/auth/users').then(json),
  setUserStatus: (id, action) => post(`/api/auth/users/${id}/${action}`),

  // organizer's own events
  myEvents: () => fetch('/api/events/mine').then(json),
};
