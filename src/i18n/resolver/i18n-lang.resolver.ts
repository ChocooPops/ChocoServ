import { Injectable } from '@nestjs/common';
import { I18nResolver } from 'nestjs-i18n';
import { ExecutionContext } from '@nestjs/common';

const AVAILABLE_LANGS = ['fr', 'en', 'ja', 'none'];
const DEFAULT_LANG = 'en';

@Injectable()
export class HeaderLanguageResolver implements I18nResolver {
  resolve(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    const lang = request.headers['lang'] ?? request.headers['accept-language'];

    if (!lang || !AVAILABLE_LANGS.includes(lang)) {
      return DEFAULT_LANG;
    }

    return lang;
  }
}