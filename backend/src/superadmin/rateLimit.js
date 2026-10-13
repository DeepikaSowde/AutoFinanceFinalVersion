// src/superadmin/rateLimit.js
//
// Slows down password guessing on super admin sign-in: after 5 failed
// attempts for one email from one address (or 20 from one address in total)
// within 15 minutes, further attempts get 429 until the window passes. A
// successful sign-in clears that email's count.
//
// Kept in memory, which is right for the single API instance this runs as;
// with several instances, move it to the database or Redis.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_ADDRESS = 20;

const failures = new Map(); // key -> { count, resetAt }

const bump = (key) => {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
};

const blockedFor = (key, max) => {
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= Date.now()) return 0;
  return entry.count >= max ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
};

// Drop expired entries now and then so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
}, WINDOW_MS).unref();

const keys = (req) => {
  const address = req.ip || req.socket?.remoteAddress || "unknown";
  const email = String(req.body?.email || "").trim().toLowerCase();
  return { addressKey: `addr:${address}`, emailKey: `email:${address}:${email}` };
};

export const loginRateLimit = (req, res, next) => {
  const { addressKey, emailKey } = keys(req);
  const wait = Math.max(blockedFor(addressKey, MAX_PER_ADDRESS), blockedFor(emailKey, MAX_PER_EMAIL));

  if (wait > 0) {
    res.set("Retry-After", String(wait));
    return res.status(429).json({ error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
  }

  next();
};

export const recordLoginFailure = (req) => {
  const { addressKey, emailKey } = keys(req);
  bump(addressKey);
  bump(emailKey);
};

export const recordLoginSuccess = (req) => {
  failures.delete(keys(req).emailKey);
};
