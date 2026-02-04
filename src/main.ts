import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  const secretHeaderValue: string = configService.get<string>('HEADER_SECRET_API');
  const headerName: string = configService.get<string>('HEADER_NAME_FIELD_SECRET_API');

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Middleware de vérification du header secret
  app.use((req, res, next) => {
    // Autoriser toutes les requêtes GET sans vérification
    if (req.method === 'GET') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
      res.header('Access-Control-Allow-Headers', `Content-Type, Authorization, ${headerName}`);
      res.header('Access-Control-Allow-Credentials', 'true');
      return next();
    }

    const requestHeaderValue = req.headers[headerName.toLowerCase()];

    // Vérifier si le header est présent et valide pour les autres méthodes
    if (requestHeaderValue === secretHeaderValue) {
      // Header valide - activer CORS
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
      res.header('Access-Control-Allow-Headers', `Content-Type, Authorization, ${headerName}`);
      res.header('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
      }

      return next();
    }

    // Header absent ou invalide - bloquer les requêtes non-GET
    return res.status(403).json({
      statusCode: 403,
      message: 'Accès refusé: header d\'authentification requis pour cette méthode',
      error: 'Forbidden'
    });
  });

  await app.listen(port);

}
bootstrap();