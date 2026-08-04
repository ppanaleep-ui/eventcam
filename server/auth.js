import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { db } from './db/index.js';

const COOKIE = 'ec_session';
const secret = config.jwtSecret || 'eventcam-dev-secret-change-me';

export function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

export function signToken(userId) {
  return jwt.sign({ uid: userId }, secret, { expiresIn: `${config.sessionDays}d` });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd(),
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}
export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// The safe, client-facing shape of a user (never leaks the password hash).
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status };
}

// Attaches req.user (full row) when a valid session cookie is present. Never
// blocks — routes opt into enforcement with the guards below.
export async function authOptional(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const { uid } = jwt.verify(token, secret);
      const user = await db().getUserById(uid);
      if (user) req.user = user;
    }
  } catch {
    /* invalid / expired token → treated as logged out */
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  next();
}

// Organizers must be approved by the site owner before they can host.
export function requireApproved(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  if (req.user.role !== 'owner' && req.user.status !== 'approved') {
    return res.status(403).json({ error: 'Your account is awaiting approval', status: req.user.status });
  }
  next();
}

export function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in' });
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  next();
}
