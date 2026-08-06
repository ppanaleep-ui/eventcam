import { Router } from 'express';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { db } from '../db/index.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  publicUser,
  requireAuth,
  requireOwner,
} from '../auth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Register an organizer account. The owner email is auto-approved; everyone
// else starts pending until the owner approves them.
router.post('/register', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim().slice(0, 60) || null;

  if (!emailOk(email)) return res.status(400).json({ error: 'Please enter a valid email' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await db().getUserByEmail(email);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const isOwner = config.ownerEmail && email === config.ownerEmail;
  const user = {
    id: nanoid(16),
    email,
    password_hash: await hashPassword(password),
    name,
    role: isOwner ? 'owner' : 'user',
    status: isOwner ? 'approved' : 'pending',
    created_at: Date.now(),
  };
  await db().createUser(user);

  setAuthCookie(res, signToken(user.id));
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const user = await db().getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  // Self-heal: if the owner email registered before it was configured.
  if (config.ownerEmail && email === config.ownerEmail && user.role !== 'owner') {
    await db().setUserRole?.(user.id, 'owner');
    await db().setUserStatus(user.id, 'approved');
    user.role = 'owner';
    user.status = 'approved';
  }
  setAuthCookie(res, signToken(user.id));
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---- Owner: manage organizer accounts ----
router.get('/users', requireAuth, requireOwner, async (req, res) => {
  const users = (await db().listUsers()).map(publicUser);
  res.json({ users });
});

router.post('/users/:id/:action', requireAuth, requireOwner, async (req, res) => {
  const { id, action } = req.params;
  const map = { approve: 'approved', reject: 'rejected', suspend: 'rejected', unsuspend: 'approved', pending: 'pending' };
  const status = map[action];
  if (!status) return res.status(400).json({ error: 'Unknown action' });

  const target = await db().getUserById(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'owner') return res.status(400).json({ error: "Can't change the owner" });

  await db().setUserStatus(id, status);
  res.json({ ok: true, id, status });
});

export default router;
