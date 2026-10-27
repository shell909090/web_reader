const CREATE_SESSION_URL = 'https://bsky.social/xrpc/com.atproto.server.createSession';

let _tokenPromise: Promise<string | null> | null = null;

/** Obtain an AT Protocol session JWT from env vars; returns null if not configured. */
async function fetchSessionToken(): Promise<string | null> {
  const identifier = process.env.BSKY_IDENTIFIER;
  const password = process.env.BSKY_APP_PASSWORD;
  if (!identifier || !password) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(CREATE_SESSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = (await resp.json()) as { accessJwt: string };
    return data.accessJwt ?? null;
  } catch {
    return null;
  }
}

/** Return cached session token (one auth call per process). */
export function getToken(): Promise<string | null> {
  if (!_tokenPromise) _tokenPromise = fetchSessionToken();
  return _tokenPromise;
}
