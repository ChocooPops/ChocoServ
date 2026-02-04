import { ConfigService } from '@nestjs/config';

export const jwtConstants = (configService: ConfigService) => ({
    secret: configService.get<string>('JWT_SECRET'),
    expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '1h',
});