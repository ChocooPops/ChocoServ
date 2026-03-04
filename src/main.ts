import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

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
      'HEADER_SECRET_API ou HEADER_NAME_FIELD_SECRET_API manquant dans les variables d\'environnement !'
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
  // 2. CORS — adapté pour Electron
  // ──────────────────────────────────────────
  // Le renderer Electron envoie une origin de type "file://" ou null
  // selon la config de ta BrowserWindow (avec/sans loadFile vs loadURL).
  // On whitelist ces deux cas uniquement.
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        null,          // main process Node.js ou client REST (Postman, etc.)
        undefined,     // même chose
        'file://',     // renderer Electron avec loadFile()
        'app://',      // renderer Electron avec protocole custom (electron-vite, etc.)
      ];

      // Si l'origin est null/undefined ou dans la liste : OK
      if (!origin || allowed.includes(origin) || origin.startsWith('file://') || origin.startsWith('app://')) {
        return callback(null, true);
      }

      console.warn(`[CORS BLOCK] Origine refusée : ${origin}`);
      callback(new Error(`Origine non autorisée : ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', headerName],
    credentials: true,
  });

  // ──────────────────────────────────────────
  // 3. FICHIERS STATIQUES & BODY PARSER
  // ──────────────────────────────────────────
  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // ──────────────────────────────────────────
  // 4. AUTHENTIFICATION PAR HEADER SECRET
  // ──────────────────────────────────────────
  app.use((req, res, next) => {
    if (req.path.startsWith('/uploads')) return next();
    if (req.path.startsWith('/stream')) return next();
    //if (req.method === 'OPTIONS') return res.sendStatus(204);

    const requestHeaderValue = req.headers[headerName.toLowerCase()];

    if (requestHeaderValue === secretHeaderValue) {
      return next();
    }

    console.warn(
      `[AUTH FAIL] ${new Date().toISOString()} — IP: ${req.ip} — ${req.method} ${req.path}`
    );

    return res.status(403).json({
      statusCode: 403,
      message: 'Accès refusé : header d\'authentification invalide ou absent',
      error: 'Forbidden',
    });
  });

  // ──────────────────────────────────────────
  // 5. ÉCOUTE SUR LOCALHOST
  // ──────────────────────────────────────────
  await app.listen(port, 'localhost');
  console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
}

bootstrap();