import { getAdmin } from '../firebaseAdmin.js';
import { SERVER_CONFIG } from '../config.js';

export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const admin = getAdmin();
    if (!admin.apps.length) {
      return res.status(503).json({ error: 'Auth service unavailable' });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.email !== SERVER_CONFIG.adminEmail) {
      return res.status(403).json({ error: 'Not authorized for admin access' });
    }

    req.adminUser = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
