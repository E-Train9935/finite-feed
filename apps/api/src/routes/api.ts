import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';
import { briefingService } from '../services/briefings.js';
import { firebaseAdminAvailable } from '../services/firebase.js';
import { inferenceRouter } from '../services/inference.js';
import { storage } from '../services/storage.js';
import { asyncHandler } from '../utils/http.js';

export const apiRouter = Router();

const synthLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  limit: config.SYNTHESIS_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Synthesis rate limit reached. Try again shortly.' },
});

const subreddit = z.string().trim().regex(/^[A-Za-z0-9_]{2,32}$/, 'Invalid subreddit name.');
const synthSchema = z.object({
  subreddits: z.array(subreddit).min(1).max(config.MAX_SUBREDDITS),
  focusQuery: z.string().trim().max(config.MAX_QUERY_LENGTH).default(''),
  mode: z.enum(['single', 'compare']).default('single'),
  models: z.array(z.string().trim().min(1).max(120)).min(1).max(2),
}).superRefine((value, ctx) => {
  if (value.mode === 'compare' && value.models.length !== 2) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Comparative mode requires exactly two models.', path: ['models'] });
  if (value.mode === 'compare' && new Set(value.models).size !== value.models.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Comparative mode requires two different models.', path: ['models'] });
});

const briefingIdSchema = z.string().trim().min(1).max(160);

const chatSchema = z.object({
  briefingId: z.string().min(1).max(160),
  model: z.string().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(16).default([]),
});

apiRouter.get('/health', asyncHandler(async (_req, res) => {
  const inference = await inferenceRouter.capabilities();
  res.json({
    ok: true,
    service: 'FINITE_FEED API',
    version: '2.0.0',
    environment: config.NODE_ENV,
    storage: storage.kind,
    firebaseAdmin: firebaseAdminAvailable(),
    inference,
    timestamp: new Date().toISOString(),
  });
}));

apiRouter.get('/ready', asyncHandler(async (_req, res) => {
  const storageHealthy = await storage.health();
  const inference = await inferenceRouter.capabilities();
  const strictInferenceRequired = config.NODE_ENV === 'production' && config.AI_PROVIDER !== 'auto';
  const ready = storageHealthy && (!strictInferenceRequired || inference.available);
  res.status(ready ? 200 : 503).json({ ready, storageHealthy, inference });
}));

// Firebase web-app configuration is public by design. Serving it at runtime lets
// the same immutable Docker image move across environments without a rebuild.
apiRouter.get('/public-config', (_req, res) => {
  const firebase = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || config.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  };
  res.json({ firebase: firebase.apiKey && firebase.projectId && firebase.appId ? firebase : null });
});

apiRouter.use(authMiddleware);

apiRouter.get('/session', asyncHandler(async (req, res) => {
  const inference = await inferenceRouter.capabilities();
  res.json({ identity: { mode: req.identity.mode }, inference, storage: storage.kind });
}));

const publicBriefing = (briefing: any) => { const { userId: _userId, ...safe } = briefing; return safe; };

apiRouter.get('/briefings', asyncHandler(async (req, res) => {
  const rows = await storage.listSummaries(req.identity.userId, 50);
  res.json({ briefings: rows });
}));

apiRouter.get('/briefings/:id', asyncHandler(async (req, res) => {
  const briefingId = briefingIdSchema.parse(req.params.id);
  const row = await storage.get(req.identity.userId, briefingId);
  if (!row) return res.status(404).json({ error: 'Briefing not found.' });
  res.json({ briefing: publicBriefing(row) });
}));

apiRouter.post('/briefings/synthesize', synthLimiter, asyncHandler(async (req, res) => {
  const input = synthSchema.parse(req.body);
  const capabilities = await inferenceRouter.capabilities();
  const allowedModels = new Set(capabilities.models);
  const invalidModel = input.models.find((model) => !allowedModels.has(model));
  if (invalidModel) return res.status(400).json({ error: `Model is not available in the configured provider: ${invalidModel}` });
  const result = await briefingService.synthesize({ userId: req.identity.userId, ...input });
  res.status(201).json({ ...result, briefing: publicBriefing(result.briefing) });
}));

apiRouter.delete('/briefings/:id', asyncHandler(async (req, res) => {
  const briefingId = briefingIdSchema.parse(req.params.id);
  await storage.delete(req.identity.userId, briefingId);
  res.status(204).end();
}));

apiRouter.delete('/briefings', asyncHandler(async (req, res) => {
  const deleted = await storage.clear(req.identity.userId);
  res.json({ deleted });
}));

apiRouter.post('/chat', asyncHandler(async (req, res) => {
  const input = chatSchema.parse(req.body);
  const reply = await briefingService.chat({ userId: req.identity.userId, ...input });
  res.json({ reply });
}));
