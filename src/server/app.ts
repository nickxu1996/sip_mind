import cors from 'cors';
import express from 'express';
import nodemailer from 'nodemailer';
import { applyRemainingIngredientRules, buildRecommendationPrompt, normalizeRecommendationOutputs, validateRecommendationRequest } from './recommendation.js';
import type { createAiProvider } from './aiProvider.js';
import type { createDatabase } from './storage.js';

type DatabaseApi = ReturnType<typeof createDatabase>;
type AiProvider = ReturnType<typeof createAiProvider>;
type CaptchaChallenge = { answer: string; expiresAt: number };
type AuthenticatedRequest = express.Request & { user?: any; token?: string };
type ContactRateRecord = { count: number; resetAt: number };

export function parseBasicAuthHeader(header: string | undefined) {
  const match = header?.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export function createApp(db: DatabaseApi, ai: AiProvider, env: Record<string, string | undefined> = process.env) {
  const app = express();
  const captchaChallenges = new Map<string, CaptchaChallenge>();
  const contactRateLimits = new Map<string, ContactRateRecord>();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true });
  });

  const getIp = (request: express.Request) => request.ip || request.headers['x-forwarded-for']?.toString() || 'unknown';
  const createCaptchaChallenge = () => {
    const left = Math.floor(Math.random() * 8) + 2;
    const right = Math.floor(Math.random() * 8) + 2;
    const id = Math.random().toString(36).slice(2, 12);
    captchaChallenges.set(id, { answer: String(left + right), expiresAt: Date.now() + 5 * 60 * 1000 });
    return { id, question: `${left} + ${right} = ?` };
  };
  const verifyCaptcha = (captcha: unknown) => {
    if (!captcha || typeof captcha !== 'object') return false;
    const record = captcha as Record<string, unknown>;
    const id = String(record.id ?? '');
    const answer = String(record.answer ?? '').trim();
    const challenge = captchaChallenges.get(id);
    if (!challenge || challenge.expiresAt < Date.now()) {
      captchaChallenges.delete(id);
      return false;
    }
    const ok = answer === challenge.answer;
    if (ok) captchaChallenges.delete(id);
    return ok;
  };

  app.get('/api/captcha', (_request, response) => {
    response.json(createCaptchaChallenge());
  });

  app.post('/api/contact', async (request, response) => {
    const ip = getIp(request);
    const now = Date.now();
    const rate = contactRateLimits.get(ip);
    if (rate && rate.resetAt > now && rate.count >= 5) {
      return response.status(429).json({ error: 'CONTACT_RATE_LIMITED' });
    }
    contactRateLimits.set(ip, rate && rate.resetAt > now
      ? { count: rate.count + 1, resetAt: rate.resetAt }
      : { count: 1, resetAt: now + 60 * 60 * 1000 });

    const message = String(request.body?.message ?? '').trim();
    const contactInfo = String(request.body?.contactInfo ?? '').trim();
    const page = String(request.body?.page ?? '').slice(0, 300);
    if (message.length < 3) return response.status(400).json({ error: 'MESSAGE_REQUIRED' });
    if (message.length > 3000) return response.status(400).json({ error: 'MESSAGE_TOO_LONG' });
    if (contactInfo.length > 300) return response.status(400).json({ error: 'CONTACT_TOO_LONG' });

    const host = env.SMTP_HOST;
    const user = env.SMTP_USER;
    const pass = env.SMTP_PASS;
    if (!host || !user || !pass) {
      return response.status(503).json({ error: 'CONTACT_NOT_CONFIGURED' });
    }

    const port = Number(env.SMTP_PORT || 587);
    const to = env.CONTACT_TO_EMAIL || 'nickxu1996@gmail.com';
    const from = env.SMTP_FROM || user;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to,
      subject: 'Sip Mind contact message',
      text: [
        'New Sip Mind contact message',
        '',
        `Contact info: ${contactInfo || 'Optional field left empty'}`,
        `IP: ${ip}`,
        `Page: ${page}`,
        '',
        message
      ].join('\n')
    });
    response.json({ success: true });
  });

  const adminAuth: express.RequestHandler = (request, response, next) => {
    const bearerUser = getBearerUser(request);
    if (bearerUser?.role === 'admin') {
      (request as AuthenticatedRequest).user = bearerUser;
      return next();
    }

    const credentials = parseBasicAuthHeader(request.headers.authorization);
    if (!credentials) {
      return response.status(401).json({ error: 'Admin authorization required' });
    }

    const adminUsername = env.ADMIN_USERNAME || 'admin';
    const adminPassword = env.ADMIN_PASSWORD || 'admin123';

    if (credentials.username !== adminUsername || credentials.password !== adminPassword) {
      return response.status(401).json({ error: 'Invalid admin credentials' });
    }

    next();
  };

  function getBearerToken(request: express.Request) {
    const match = request.headers.authorization?.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
  }

  function getBearerUser(request: express.Request) {
    const token = getBearerToken(request);
    if (!token) return null;
    return db.getSessionUser(token);
  }

  const requireUser: express.RequestHandler = (request, response, next) => {
    const token = getBearerToken(request);
    const user = token ? db.getSessionUser(token) : null;
    if (!token || !user) return response.status(401).json({ error: 'AUTH_REQUIRED' });
    (request as AuthenticatedRequest).token = token;
    (request as AuthenticatedRequest).user = user;
    next();
  };

  function publicUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      type: user.username ? 'account' : 'invite'
    };
  }

  app.post('/api/login', (request, response) => {
    const { username, password, inviteCode, captcha } = request.body;
    const ip = getIp(request);

    const attempts = db.getLoginAttempts(ip);
    const isAdminCredential = username === (env.ADMIN_USERNAME || 'admin') && password === (env.ADMIN_PASSWORD || 'admin123');
    if (attempts >= 5 && !isAdminCredential && !verifyCaptcha(captcha)) {
      return response.status(403).json({ error: 'CAPTCHA_REQUIRED', message: 'Too many attempts. CAPTCHA required.' });
    }

    if (inviteCode) {
      const invite = db.getInviteCodeRecord(inviteCode.toUpperCase());
      if (!invite) {
        db.recordLoginAttempt(ip);
        return response.status(401).json({ error: 'Invalid invite code' });
      }

      let user = db.getUserByInviteCode(inviteCode.toUpperCase()) as any;
      if (!user) {
        const id = db.createUser({ invite_code: inviteCode.toUpperCase(), role: 'user' });
        user = { id, invite_code: inviteCode.toUpperCase(), role: 'user' };
      }
      const token = db.createSession(user.id);
      return response.json({ success: true, token, user: publicUser(user) });
    }

    if (username && password) {
      const user = db.getUserByUsername(username) as any;
      if (user && db.verifyUserPassword(user, password)) {
        const token = db.createSession(user.id);
        return response.json({ success: true, token, user: publicUser(user) });
      }
    }

    db.recordLoginAttempt(ip);
    response.status(401).json({ error: 'Invalid credentials' });
  });

  app.post('/api/register', (request, response) => {
    const { username, password, confirmPassword, captcha } = request.body;
    const ip = getIp(request);
    const attempts = db.getRegistrationAttempts(ip);
    db.recordRegistrationAttempt(ip);

    if (attempts >= 3 && !verifyCaptcha(captcha)) {
      return response.status(403).json({ error: 'CAPTCHA_REQUIRED', captchaRequired: true });
    }

    const cleanUsername = String(username ?? '').trim();
    const cleanPassword = String(password ?? '');
    if (cleanUsername.length < 3) return response.status(400).json({ error: 'USERNAME_TOO_SHORT' });
    if (cleanPassword.length < 6) return response.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
    if (cleanPassword !== String(confirmPassword ?? '')) return response.status(400).json({ error: 'PASSWORD_CONFIRM_MISMATCH' });
    if (db.getUserByUsername(cleanUsername)) return response.status(409).json({ error: 'USERNAME_EXISTS' });

    try {
      const id = db.createUser({ username: cleanUsername, password: cleanPassword, role: 'user' });
      const token = db.createSession(id);
      response.json({ success: true, token, user: { id, username: cleanUsername, role: 'user', type: 'account' } });
    } catch (error) {
      response.status(409).json({ error: 'USERNAME_EXISTS' });
    }
  });

  app.get('/api/inventory/categories', (request, response) => {
    response.json({ categories: db.getInventoryCategories() });
  });

  app.get('/api/food-library/public', (_request, response) => {
    response.json({ foodLibrary: db.getFoodLibrary(0) });
  });

  app.get('/api/public/config', (_request, response) => {
    response.json({
      daily_limit_guest: db.getConfig('daily_limit_guest') || '10'
    });
  });

  app.post('/api/logout', requireUser, (request, response) => {
    const token = (request as AuthenticatedRequest).token;
    if (token) db.deleteSession(token);
    response.json({ success: true });
  });

  app.get('/api/user/data', requireUser, (request, response) => {
    const userId = Number((request as AuthenticatedRequest).user.id);

    const inventory = db.getInventory(userId);
    const foodLibrary = db.getFoodLibrary(userId);
    const favorites = db.getFavorites(userId).map((favorite: any) => ({
      ...favorite,
      ingredients: JSON.parse(favorite.ingredients_json),
      steps: JSON.parse(favorite.steps_json),
      metadata: JSON.parse(favorite.metadata_json)
    }));

    response.json({ inventory, favorites, foodLibrary });
  });

  app.post('/api/user/inventory', requireUser, (request, response) => {
    const { items } = request.body;
    const userId = Number((request as AuthenticatedRequest).user.id);
    db.setInventory(userId, items);
    response.json({ success: true });
  });

  app.post('/api/user/favorites', requireUser, (request, response) => {
    const { favorite } = request.body;
    const userId = Number((request as AuthenticatedRequest).user.id);
    const id = db.upsertFavorite(userId, favorite);
    response.json({ success: true, id });
  });

  app.delete('/api/user/favorites/:id', requireUser, (request, response) => {
    const userId = Number((request as AuthenticatedRequest).user.id);
    db.deleteFavorite(userId, Number(request.params.id));
    response.json({ success: true });
  });

  app.post('/api/recommendations', async (request, response) => {
    const { userId: _ignoredUserId, deviceId, ...requestBody } = request.body;
    const ip = getIp(request);
    const user = getBearerUser(request);
    const userId = user ? Number(user.id) : null;
    const cleanDeviceId = String(deviceId ?? '').trim().slice(0, 120);

    const globalCount = db.getDailyGlobalGenerationCount();
    const globalLimit = Number(db.getConfig('daily_limit_global') || 200);
    if (globalCount >= globalLimit) return response.status(429).json({ error: 'GLOBAL_DAILY_LIMIT_REACHED' });

    if (userId) {
      const count = db.getDailyGenerationCount(userId, ip);
      const userLimit = Number(db.getConfig('daily_limit_user') || 50);
      if (count >= userLimit) return response.status(429).json({ error: 'USER_DAILY_LIMIT_REACHED' });
    } else {
      if (!cleanDeviceId) return response.status(400).json({ error: 'DEVICE_ID_REQUIRED' });
      const count = db.getDailyGuestGenerationCount(ip, cleanDeviceId);
      const guestLimit = Number(db.getConfig('daily_limit_guest') || 10);
      if (count >= guestLimit) return response.status(429).json({ error: 'GUEST_DAILY_LIMIT_REACHED' });
    }

    const result = validateRecommendationRequest(requestBody);
    if (!result.success) return response.status(400).json({ error: 'Invalid request' });

    const prompt = buildRecommendationPrompt(result.data);

    const saveAndRespond = (recommendations: ReturnType<typeof normalizeRecommendationOutputs>, providerLabel: string, warning?: string) => {
      db.saveRecommendationSession({
        request: result.data,
        provider: providerLabel,
        model: ai.model,
        prompt,
        recommendations
      });
      db.logGeneration(userId, ip, userId ? null : cleanDeviceId);
      response.json(warning ? { recommendations, warning } : { recommendations });
    };

    try {
      const aiResult = await ai.generateRecommendations(prompt);
      const recommendations = applyRemainingIngredientRules(normalizeRecommendationOutputs(aiResult), result.data);

      if (recommendations.length === 0) {
        console.error('[Sip Mind] AI response did not contain usable recommendations:', aiResult);
        return response.status(502).json({ error: 'AI_RESPONSE_UNUSABLE' });
      }

      saveAndRespond(recommendations, ai.name);
    } catch (error) {
      console.error('[Sip Mind] Recommendation generation failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      response.status(502).json({ error: 'AI_GENERATION_FAILED', message });
    }
  });

  app.get('/api/admin/config', adminAuth, (request, response) => {
    response.json({
      daily_limit_global: db.getConfig('daily_limit_global') || '200',
      daily_limit_user: db.getConfig('daily_limit_user') || '50',
      daily_limit_guest: db.getConfig('daily_limit_guest') || '10'
    });
  });

  app.post('/api/admin/config', adminAuth, (request, response) => {
    for (const [key, value] of Object.entries(request.body)) {
      if (!['daily_limit_global', 'daily_limit_user', 'daily_limit_guest'].includes(key)) continue;
      db.setConfig(key, String(value));
    }
    response.json({ success: true });
  });

  app.get('/api/admin/invites', adminAuth, (request, response) => {
    response.json(db.listInviteCodes());
  });

  app.post('/api/admin/invites', adminAuth, (request, response) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      try {
        db.createInviteCode(code, Number(request.body.adminId));
        return response.json({ code });
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
  });

  app.post('/api/admin/inventory/categories', adminAuth, (request, response) => {
    try {
      const name = db.addInventoryCategory({
        label_zh: String(request.body.label_zh ?? request.body.zh ?? request.body.name ?? ''),
        label_en: String(request.body.label_en ?? request.body.en ?? request.body.name ?? '')
      });
      response.json({ success: true, name, categories: db.getInventoryCategories() });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid category' });
    }
  });

  const deleteInventoryCategory = (name: unknown, response: express.Response) => {
    try {
      db.deleteInventoryCategory(String(name ?? ''));
      response.json({ success: true, categories: db.getInventoryCategories() });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid category' });
    }
  };

  app.delete('/api/admin/inventory/categories', adminAuth, (request, response) => {
    deleteInventoryCategory(request.body.name, response);
  });

  app.delete('/api/admin/inventory/categories/:name', adminAuth, (request, response) => {
    deleteInventoryCategory(request.params.name, response);
  });

  app.delete('/api/admin/food-library/:id', adminAuth, (request, response) => {
    const userId = Number(request.query.userId);
    if (!userId) return response.status(400).json({ error: 'userId is required' });
    db.deleteFoodLibraryItem(userId, Number(request.params.id));
    response.json({ success: true, foodLibrary: db.getFoodLibrary(userId) });
  });

  app.delete('/api/admin/food-library', adminAuth, (request, response) => {
    const userId = Number(request.query.userId ?? request.body.userId);
    if (!userId) return response.status(400).json({ error: 'userId is required' });
    db.clearFoodLibrary(userId);
    response.json({ success: true, foodLibrary: [] });
  });

  return app;
}
