import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { LoggerService } from './common-service/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const secretHeaderValue = configService.get<string>('HEADER_SECRET_API');
  const headerName = configService.get<string>('HEADER_NAME_FIELD_SECRET_API');

  if (!secretHeaderValue || !headerName) {
    throw new Error(
      'HEADER_SECRET_API or HEADER_NAME_FIELD_SECRET_API is missing from the environment variables !'
    );
  }

  // ──────────────────────────────────────────
  // 1. HELMET
  // ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  }));

  // ──────────────────────────────────────────
  // 2. CORS — adapted for Electron
  // ──────────────────────────────────────────
  // The Electron renderer sends an origin of type "file://" or null
  // depending on the BrowserWindow config (with/without loadFile vs loadURL).
  // We whitelist only these two cases.
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        null,          // Node.js main process or REST client (Postman, etc.)
        undefined,     // same thing
        'file://',     // Electron renderer with loadFile()
        'app://',      // Electron renderer with custom protocol (electron-vite, etc.)
      ];

      // If the origin is null/undefined or in the list: OK
      if (!origin || allowed.includes(origin) || origin.startsWith('file://') || origin.startsWith('app://')) {
        return callback(null, true);
      }

      console.warn(`[CORS BLOCK] Origin rejected: ${origin}`);
      callback(new Error(`Origin not authorized: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', headerName],
    credentials: true,
  });

  // ──────────────────────────────────────────
  // 3. STATIC FILES & BODY PARSER
  // ──────────────────────────────────────────
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  app.use(bodyParser.json({ limit: '150mb' }));
  app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

  // ──────────────────────────────────────────
  // 4. SECRET HEADER AUTHENTICATION
  // ──────────────────────────────────────────
  const loggerService = app.get(LoggerService);
  app.use((req, res, next) => {
    if (req.path.startsWith('/uploads')) return next();
    if (req.path.startsWith('/stream')) return next();
    //if (req.method === 'OPTIONS') return res.sendStatus(204);

    const requestHeaderValue = req.headers[headerName.toLowerCase()];

    if (requestHeaderValue === secretHeaderValue) {
      return next();
    }

    const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    loggerService.warn(`🚫 403 [${now}] ${req.method} ${req.path} — IP: ${req.ip} — Reason: Invalid header`);

    return res.status(403).json({
      statusCode: 403,
      message: 'Access denied: Invalid or missing authentication header',
      error: 'Forbidden',
    });
  });

  // ──────────────────────────────────────────
  // 5. LISTEN ON LOCALHOST
  // ──────────────────────────────────────────
  await app.listen(port, 'localhost');
  console.log(`🚀 Server started on http://localhost:${port}`);
}

bootstrap();