import cors from 'cors';
import express from 'express';
import { applyRemainingIngredientRules, buildRecommendationPrompt, normalizeRecommendationOutputs, validateRecommendationRequest } from './recommendation';
import type { createAiProvider } from './aiProvider';
import type { createDatabase } from './storage';

type DatabaseApi = ReturnType<typeof createDatabase>;
type AiProvider = ReturnType<typeof createAiProvider>;
type CaptchaChallenge = { answer: string; expiresAt: number };

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

  const adminAuth: express.RequestHandler = (request, response, next) => {
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

  app.post('/api/login', (request, response) => {
    const { username, password, inviteCode, captcha } = request.body;
    const ip = getIp(request);

    const attempts = db.getLoginAttempts(ip);
    const isAdminCredential = username === (env.ADMIN_USERNAME || 'admin') && password === (env.ADMIN_PASSWORD || 'admin123');
    if (attempts >= 5 && !captcha && !isAdminCredential) {
      return response.status(403).json({ error: 'CAPTCHA_REQUIRED', message: 'Too many attempts. CAPTCHA required.' });
    }

    if (inviteCode) {
      const invite = db.getInviteCodeRecord(inviteCode.toUpperCase());
      if (!invite) return response.status(401).json({ error: 'Invalid invite code' });

      let user = db.getUserByInviteCode(inviteCode.toUpperCase()) as any;
      if (!user) {
        const id = db.createUser({ invite_code: inviteCode.toUpperCase(), role: 'user' });
        user = { id, invite_code: inviteCode.toUpperCase(), role: 'user' };
      }
      return response.json({ success: true, user: { id: user.id, role: user.role, type: 'invite' } });
    }

    if (username && password) {
      const user = db.getUserByUsername(username) as any;
      if (user && user.password === password) {
        return response.json({ success: true, user: { id: user.id, username: user.username, role: user.role, type: 'account' } });
      }
    }

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
      response.json({ success: true, user: { id, username: cleanUsername, role: 'user', type: 'account' } });
    } catch (error) {
      response.status(409).json({ error: 'USERNAME_EXISTS' });
    }
  });

  app.get('/api/inventory/categories', (request, response) => {
    response.json({ categories: db.getInventoryCategories() });
  });

  app.get('/api/user/data', (request, response) => {
    const userId = Number(request.query.userId);
    if (!userId) return response.status(401).send();

    const inventory = db.getInventory(userId);
    for (const item of inventory as any[]) {
      db.upsertFoodLibraryItem(userId, item.name, item.category);
    }
    const foodLibrary = db.getFoodLibrary(userId);
    const favorites = db.getFavorites(userId).map((favorite: any) => ({
      ...favorite,
      ingredients: JSON.parse(favorite.ingredients_json),
      steps: JSON.parse(favorite.steps_json),
      metadata: JSON.parse(favorite.metadata_json)
    }));

    response.json({ inventory, favorites, foodLibrary });
  });

  app.post('/api/user/inventory', (request, response) => {
    const { userId, items } = request.body;
    db.setInventory(userId, items);
    response.json({ success: true });
  });

  app.post('/api/user/favorites', (request, response) => {
    const { userId, favorite } = request.body;
    const id = db.upsertFavorite(userId, favorite);
    response.json({ success: true, id });
  });

  app.delete('/api/user/favorites/:id', (request, response) => {
    const userId = Number(request.query.userId);
    db.deleteFavorite(userId, Number(request.params.id));
    response.json({ success: true });
  });

  app.post('/api/recommendations', async (request, response) => {
    const { userId, ...requestBody } = request.body;
    const ip = getIp(request);

    if (!userId) return response.status(401).json({ error: 'Registration required to generate recipes' });

    const user = db.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return response.status(401).send();

    const count = db.getDailyGenerationCount(userId, ip);
    if (user.role !== 'admin') {
      const limitKey = user.username ? 'daily_limit_account' : 'daily_limit_invite';
      const limit = Number(db.getConfig(limitKey) || 10);
      if (count >= limit) return response.status(429).json({ error: 'DAILY_LIMIT_REACHED' });
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
      db.logGeneration(userId, ip);
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

  app.get('/api/admin/config', (request, response) => {
    response.json({
      daily_limit_ip: db.getConfig('daily_limit_ip'),
      daily_limit_account: db.getConfig('daily_limit_account'),
      daily_limit_invite: db.getConfig('daily_limit_invite')
    });
  });

  app.post('/api/admin/config', (request, response) => {
    for (const [key, value] of Object.entries(request.body)) {
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
      const name = db.addInventoryCategory(String(request.body.name ?? ''));
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
