import { authService } from '../modules/auth/auth.service.js';

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      acc[name] = decodeURIComponent(rest.join('='));
    }
    return acc;
  }, {});
}

export async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.session_id || req.headers['x-session-id'];

    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized: No session provided' });
    }

    const user = await authService.getUserBysessionId(sessionId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }

    req.user = user;
    req.sessionId = sessionId;
    next();
  } catch (err) {
    console.error('[requireAuth] error:', err);
    return res.status(401).json({ error: 'Unauthorized: Authentication failed' });
  }
}
