import crypto from "node:crypto";

const SECRET = process.env.BLINK_SESSION_SECRET ?? crypto.randomBytes(32).toString("hex");
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

if (!process.env.BLINK_SESSION_SECRET) {
  console.warn(
    "WARNING: BLINK_SESSION_SECRET is not set — sessions will invalidate on every server restart.",
  );
}

export function signSession(username: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${username}.${expires}`;
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [username, expires, signature] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${username}.${expires}`)
    .digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(expires) > Date.now();
}

export const SESSION_COOKIE = "blink_admin";
