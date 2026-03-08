import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

@Injectable()
export class LoggerService {
  private readonly winston: winston.Logger;

  constructor() {
    const infoOnly = winston.format((info) => {
      return info.level === 'info' ? info : false;
    });

    const warnOnly = winston.format((info) => {
      return info.level === 'warn' ? info : false;
    });

    const errorOnly = winston.format((info) => {
      return info.level === 'error' ? info : false;
    });

    const baseFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        const date = new Date(timestamp as string).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
        return `[${date}] [${level.toUpperCase()}] ${message}`;
      }),
    );

    this.winston = winston.createLogger({
      level: 'info',
      transports: [
        // ── app.log — info uniquement (✅ succès, 3xx) ───────
        new winston.transports.DailyRotateFile({
          filename: 'logs/%DATE%/app-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          auditFile: 'logs/.app-audit.json',
          format: winston.format.combine(infoOnly(), baseFormat),
        }),

        // ── warn.log — warn uniquement (🚫 403, ❌ 4xx) ──────
        new winston.transports.DailyRotateFile({
          filename: 'logs/%DATE%/warn-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          auditFile: 'logs/.warn-audit.json',
          format: winston.format.combine(warnOnly(), baseFormat),
        }),

        // ── error.log — error uniquement (💥 5xx) ────────────
        new winston.transports.DailyRotateFile({
          filename: 'logs/%DATE%/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: '30d',
          auditFile: 'logs/.error-audit.json',
          format: winston.format.combine(errorOnly(), baseFormat),
        }),
      ],
    });
  }

  log(message: string)  { this.winston.info(message); }
  warn(message: string) { this.winston.warn(message); }
  error(message: string, stack?: string) {
    this.winston.error(stack ? `${message}\n${stack}` : message);
  }
}