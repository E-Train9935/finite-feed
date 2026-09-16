import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttpModule from 'pino-http';

const pinoHttp =
  pinoHttpModule as unknown as typeof import('pino-http').pinoHttp;
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';
import { requestId, safeErrorMessage } from './utils/http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(pinoHttp<Request, Response>({
    genReqId: (req, res) => {
      const id = req.headers['x-request-id']?.toString() || requestId();
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  }));
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com', 'wss://*.firebaseio.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS policy.'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '256kb' }));
  const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    limit: config.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  app.use('/api/v1', apiLimiter, apiRouter);

  const webDist = resolve(process.cwd(), 'apps/web/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: config.NODE_ENV === 'production' ? '1h' : 0, index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(resolve(webDist, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => res.json({ service: 'FINITE_FEED API', docs: '/api/v1/health' }));
  }

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid request.', issues: error.issues });
    }
    const statusCode = Number((error as any)?.statusCode || 500);
    req.log.error({ err: error }, 'request failed');
    res.status(statusCode).json({
      error: statusCode >= 500 && config.NODE_ENV === 'production' ? 'Internal server error.' : safeErrorMessage(error),
      requestId: req.id,
    });
  });

  return app;
}
