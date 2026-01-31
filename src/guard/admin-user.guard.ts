import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/user/dto/role.enum';
import { UserService } from 'src/user/service/user.service';
import { User } from 'src/user/dto/user.interface';

@Injectable()
export class AdminUserGuard implements CanActivate {
    
    constructor(private readonly reflector: Reflector,
        private readonly userService: UserService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const currentUser: User = await this.userService.getRoleByUserId(user.sub);
        if (!user || !currentUser) {
            throw new UnauthorizedException('Utilisateur non authentifié.');
        }

        if (user.role !== Role.ADMIN || currentUser.role !== Role.ADMIN) {
            throw new UnauthorizedException('Compte utilisateur non admin.');
        }

        return true;
    }

}