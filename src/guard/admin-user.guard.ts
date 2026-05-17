import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/user/dto/role.enum';
import { UserService } from 'src/user/service/user.service';
import { User } from 'src/user/dto/user.interface';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class AdminUserGuard implements CanActivate {
    
    constructor(private readonly reflector: Reflector,
        private readonly userService: UserService,
        private readonly i18nService: I18nService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const currentUser: User = await this.userService.getRoleByUserId(user.sub);
        if (!user || !currentUser) {
            throw new UnauthorizedException(this.i18nService.t("common.AUTH.UNAUTHENTICATED_USER"));
        }

        if (user.role !== Role.ADMIN || currentUser.role !== Role.ADMIN) {
            throw new UnauthorizedException(this.i18nService.t("common.AUTH.USER_ACCOUNT_NOT_ADMIN"));
        }

        return true;
    }

}