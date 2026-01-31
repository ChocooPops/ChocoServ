import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ProfilPhoto } from '../dto/profil-photo.interface';
import { AdminUserGuard } from "src/guard/admin-user.guard";
import { ProfilPhotoService } from '../service/profil-photo.service';

@Controller('profil-photo')
export class ProfilPhotoController {

    constructor(private profilPhotoService: ProfilPhotoService) { }

    @Get()
    public async getAllProfilPicture(): Promise<ProfilPhoto[]> {
        return await this.profilPhotoService.getAllProfilPicture();
    }

    @UseGuards(AdminUserGuard)
    @Post()
    public async fillAllProfilPictureData(): Promise<any[]> {
        return await this.profilPhotoService.fillAllProfilPictureData();
    }

}
