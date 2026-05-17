import {
    Injectable,
    ExecutionContext,
    CanActivate,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PUBLIC_KEY } from './public.decorator';
import { UserService } from 'src/user/service/user.service';
import { jwtConstants } from 'src/auth/constant';
import { User } from 'src/user/dto/user.interface';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { Role } from 'src/user/dto/role.enum';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly userService: UserService,
        private readonly configService: ConfigService,
        private readonly i18nService: I18nService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);
        if (!token) {
            throw new UnauthorizedException(this.i18nService.t('common.AUTH.MISSING_INVALID_TOKEN'));
        }
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: jwtConstants(this.configService).secret,
            });
            const user: User = await this.userService.getUserById(payload.sub);

            if (!user || user.role === Role.NOT_ACTIVATE || user.role === Role.SUSPENDED) {
                throw new UnauthorizedException(this.i18nService.t('common.AUTH.INVALID_EXPIRED_TOKEN'));
            }

            request['user'] = payload;

        } catch (error) {
            throw new UnauthorizedException(this.i18nService.t('common.AUTH.USER_DISABLED_OR_NOT_EXIST'))
        }

        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}