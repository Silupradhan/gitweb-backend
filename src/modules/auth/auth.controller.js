import { authService } from './auth.service.js';
import { env } from '../../config/env.js';

const COOKIE_NAME = 'session_id';

export const authController = {
  redirectToGitHub(req, res) {
    if (!env.githubClientId) {
      return res.status(500).json({ error: 'GitHub OAuth Client ID is not configured on the backend.' });
    }
    const authUrl = authService.getGitHubAuthorizeUrl();
    res.redirect(authUrl);
  },

  async handleGitHubCallback(req, res) {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).redirect(`${env.frontendUrl}?error=missing_code`);
      }

      const { sessionId } = await authService.handleGitHubCallback(code);

      // Set secure cookie (FR-9.3)
      res.cookie(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: env.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.redirect(env.frontendUrl);
    } catch (err) {
      console.error('[auth] GitHub callback error:', err);
      res.redirect(`${env.frontendUrl}?error=${encodeURIComponent(err.message)}`);
    }
  },

  async getCurrentUser(req, res) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user: req.user });
  },

  async logout(req, res) {
    try {
      const sessionId = req.cookies?.[COOKIE_NAME] || req.headers['x-session-id'];
      if (sessionId) {
        await authService.logout(sessionId);
      }
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: env.nodeEnv === 'production',
        sameSite: 'lax',
      });
      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      console.error('[auth] Logout error:', err);
      res.status(500).json({ error: 'Failed to logout' });
    }
  },
};
