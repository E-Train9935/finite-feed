import type { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { getAdminAuth } from '../services/firebase.js';
import type { AuthIdentity } from '../types.js';

const COOKIE_NAME = 'ff_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

function sign(payload: string) {
  return createHmac('sha256', config.SESSION_SECRET).update(payload).digest('base64url');
}

function createGuestToken() {
  const id = randomBytes(18).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS;
  const payload = `${id}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyGuestToken(token?: string) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, expRaw, signature] = parts;
  if (!id || !expRaw || !signature) return null;
  const payload = `${id}.${expRaw}`;
  const expected = sign(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  return id;
}

function setGuestCookie(res: Response, token: string) {
  const secure = config.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_SECONDS * 1000,
    path: '/',
  });
}

declare global {
  namespace Express {
    interface Request {
      identity: AuthIdentity;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.header('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const adminAuth = getAdminAuth();

    if (bearer && adminAuth) {
      const decoded = await adminAuth.verifyIdToken(bearer, true);
      req.identity = { userId: `firebase:${decoded.uid}`, mode: 'firebase' };
      return next();
    }

    const cookies = parseCookies(req.header('cookie') || '');
    const guestId = verifyGuestToken(cookies[COOKIE_NAME]);
    if (guestId) {
      req.identity = { userId: `guest:${guestId}`, mode: 'guest' };
      return next();
    }

    const guestToken = createGuestToken();
    const createdGuestId = verifyGuestToken(guestToken);
    if (!createdGuestId) throw new Error('Unable to create guest session');
    setGuestCookie(res, guestToken);
    req.identity = { userId: `guest:${createdGuestId}`, mode: 'guest' };
    next();
  } catch (error) {
    console.warn('Authentication failed:', error);
    res.status(401).json({ error: 'Authentication failed.' });
  }
}
