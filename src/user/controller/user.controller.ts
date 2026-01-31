import { Controller, ParseIntPipe, Get, UseGuards, Put, Delete, Param, Body } from '@nestjs/common';
import { UserService } from '../service/user.service';
import { CurrentUser } from 'src/guard/current-user.guard';
import { User } from '../dto/user.interface';
import { AdminUserGuard } from "src/guard/admin-user.guard";
import { Media } from 'src/media/dto/media.interface';
import { Role } from '../dto/role.enum';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { ProfilPhoto } from 'src/profil-photo/dto/profil-photo.interface';
import { UpdateUser } from '../dto/update-user.interface';

@Controller('user')
export class UserController {

    constructor(private userService: UserService) { }

    @Get('current-user')
    async getCurrentUserByToken(@CurrentUser('sub', ParseIntPipe) userId: number): Promise<User> {
        return await this.userService.getUserById(userId);
    }

    @UseGuards(AdminUserGuard)
    @Get('all-user')
    async getAllUser(): Promise<User[]> {
        return await this.userService.getAllUser();
    }

    @Get('my-list')
    async getMyMediaListByUserId(@CurrentUser('sub', ParseIntPipe) userId: number): Promise<Media[]> {
        return await this.userService.getMyMediaListByUserId(userId)
    }

    @Put('toggle-into-my-list/:mediaId')
    async toggleMediaIntoList(@CurrentUser('sub', ParseIntPipe) userId: number, @Param('mediaId', ParseIntPipe) mediaId: number): Promise<ReturnMessage> {
        return await this.userService.toggleMediaIntoList(userId, mediaId);
    }

    @Put('profil-picture/:idProfilPicture')
    async updateProfilPictureByUserId(@CurrentUser('sub', ParseIntPipe) userId: number, @Param('idProfilPicture', ParseIntPipe) idProfilPicture: number): Promise<ProfilPhoto> {
        return await this.userService.updateProfilPictureByUserId(userId, idProfilPicture);
    }

    @Put('update-user-by-user')
    async updateUserByUserId(@CurrentUser('sub', ParseIntPipe) userId: number, @Body() updateUser: UpdateUser): Promise<ReturnMessage> {
        return await this.userService.updateUserByUserId(userId, updateUser);
    }

    @UseGuards(AdminUserGuard)
    @Put('update-role-by-admin/:id')
    updateUserRoleByAdmin(@Param('id', ParseIntPipe) userId: number, @Body('role') role: Role): Promise<ReturnMessage> {
        return this.userService.updateUserRoleByAdmin(userId, role);
    }

    @Delete()
    async deleteUserByUser(@CurrentUser('sub', ParseIntPipe) userId: number): Promise<ReturnMessage> {
        return await this.userService.deleteUserById(userId);
    }

    @UseGuards(AdminUserGuard)
    @Delete('delete-user-by-admin/:id')
    async deleteUserByAdmin(@Param('id', ParseIntPipe) userId: number): Promise<ReturnMessage> {
        return await this.userService.deleteUserById(userId, true);
    }

}
