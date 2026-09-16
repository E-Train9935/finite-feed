import 'dotenv/config';
import { z } from 'zod';

const boolString = z.string().optional().transform((value) => value !== 'false');
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  APP_ID: z.string().default('finite-feed'),
  PUBLIC_APP_URL: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8080'),
  SESSION_SECRET: z.string().default('finite-feed-development-secret-change-me'),
  STORAGE_DRIVER: z.enum(['file', 'firestore']).default('file'),
  DATA_FILE: z.string().default('./apps/api/data/briefings.json'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().default('FINITE_FEED/2.0 portfolio-app'),
  REDDIT_POST_LIMIT: z.coerce.number().int().min(5).max(50).default(15),
  ALLOW_PUBLIC_REDDIT_FALLBACK: boolString,
  ALLOW_DEMO_SOURCES: boolString,
  AI_PROVIDER: z.enum(['auto', 'ollama', 'openai-compatible']).default('auto'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(5000).max(180000).default(60000),
  AI_DEFAULT_MODEL: z.string().default('llama3.2:3b'),
  AI_COMPARISON_MODEL: z.string().default('mistral:7b'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_API_KEY: z.string().optional(),
  OLLAMA_MODELS: z.string().default('llama3.2:3b,mistral:7b,phi3:mini'),
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODELS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  SYNTHESIS_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  MAX_SUBREDDITS: z.coerce.number().int().min(1).max(12).default(6),
  MAX_QUERY_LENGTH: z.coerce.number().int().min(100).max(2000).default(500),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === 'production' && parsed.SESSION_SECRET.includes('change-me')) {
  throw new Error('SESSION_SECRET must be replaced before production startup.');
}

if (parsed.STORAGE_DRIVER === 'firestore' && !parsed.FIREBASE_PROJECT_ID && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error('Firestore storage requires FIREBASE_PROJECT_ID or Google Application Default Credentials.');
}

export const config = {
  ...parsed,
  allowedOrigins: Array.from(new Set([...parsed.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean), parsed.PUBLIC_APP_URL])),
  ollamaModels: parsed.OLLAMA_MODELS.split(',').map((value) => value.trim()).filter(Boolean),
  hostedModels: (parsed.AI_MODELS || '').split(',').map((value) => value.trim()).filter(Boolean),
};
