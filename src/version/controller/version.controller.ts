import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { VersionService } from '../service/version.service';
import { Version } from '../dto/version.interface';
import { OS } from '../dto/os.enum';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { AdminUserGuard } from "src/guard/admin-user.guard";

@Controller('version')
export class VersionController {

    constructor(private readonly versionService: VersionService) { }

    @Get('windows')
    public async getLastVersionWindows(): Promise<Version> {
        return await this.versionService.getLastVersionByOS(OS.WINDOWS);
    }

    @Get('linux')
    public async getLastVersionLinux(): Promise<Version> {
        return await this.versionService.getLastVersionByOS(OS.LINUX);
    }

    @Get('macos')
    public async getLastVersionMacOS(): Promise<Version> {
        return await this.versionService.getLastVersionByOS(OS.MACOS);
    }

    @Get('all')
    public async getAllLastVersion(): Promise<Version[]> {
        return await this.versionService.getAllLastVersion();
    }

    @UseGuards(AdminUserGuard)
    @Put()
    public async updateVersionByOs(@Body() version: Version): Promise<ReturnMessage> {
        return await this.versionService.updateVersionByOs(version);
    }
    
}
