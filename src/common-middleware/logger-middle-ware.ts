import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '../common-service/logger.service';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const start = Date.now();

    const originalJson = res.json.bind(res);
    let responseBody: any;

    res.json = (body: any) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      const base = `[${now}] ${method} ${originalUrl} — IP: ${ip} — ${duration}ms`;

      if (statusCode >= 200 && statusCode < 300) {
        this.logger.log(`✅ ${statusCode} ${base}`);

      } else if (statusCode === 401 || statusCode === 403) {
        const reason = responseBody?.message || 'Accès refusé';
        this.logger.warn(`🚫 ${statusCode} ${base} — Raison: ${reason}`);

      } else if (statusCode >= 300 && statusCode < 400) {
        this.logger.log(`🔀 ${statusCode} ${base}`);

      } else if (statusCode >= 400 && statusCode < 500) {
        const reason = responseBody?.message || 'Erreur client';
        this.logger.warn(`❌ ${statusCode} ${base} — ${reason}`);

      } else if (statusCode >= 500) {
        const reason = responseBody?.message || 'Erreur serveur';
        this.logger.error(`💥 ${statusCode} ${base} — ${reason}`);
      }
    });

    res.on('error', (err: Error) => {
      const duration = Date.now() - start;
      const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      this.logger.error(
        `💥 ERROR [${now}] ${method} ${originalUrl} — IP: ${ip} — ${duration}ms — ${err.message}`,
        err.stack,
      );
    });

    next();
  }
}