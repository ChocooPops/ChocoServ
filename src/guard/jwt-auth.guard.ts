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

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private reflector: Reflector,
        private userService: UserService,
        private configService: ConfigService
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
            throw new UnauthorizedException('Token manquant ou mal formé');
        }
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: jwtConstants(this.configService).secret,
            });
            const user: User = await this.userService.getUserById(payload.sub);

            if (!user || user.role === 'NOT_ACTIVATE') {
                throw new UnauthorizedException('Utilisateur désactivé ou inexistant');
            }

            request['user'] = payload;

        } catch (error) {
            throw new UnauthorizedException('Token invalide ou expiré');
        }

        return true;
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}