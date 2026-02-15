import { Controller, Get, Post, UseGuards, Put, Delete, ParseIntPipe, Body, Param } from '@nestjs/common';
import { LicenseService } from '../service/license.service';
import { AdminUserGuard } from 'src/guard/admin-user.guard';
import { License } from '../dto/license.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { EditLicense } from '../dto/edit-license.interface';
import { Graph } from 'src/common-interface/graph.intrface';
import { CurrentUser } from 'src/guard/current-user.guard';

@Controller('license')
export class LicenseController {

    constructor(private licenseService: LicenseService) { }

    @Get('graph')
    async getGraphLicense(): Promise<Graph> {
        return await this.licenseService.getGraphLicense();
    }

    @Get('home-page')
    async getAllLicenseHome(): Promise<License[]> {
        return await this.licenseService.getLicenseHome();
    }

    @Get('research-page')
    async getAllLicenseResearch(): Promise<License[]> {
        return await this.licenseService.getLicenseResearch();
    }

    @Get('research/:keyWord')
    async getAllLicenseWanted(@Param('keyWord') keyWord: string): Promise<License[]> {
        return await this.licenseService.getLicenseByResearched(keyWord);
    }

    @Get(':id')
    async getLicenseById(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number): Promise<License> {
        return await this.licenseService.getEntirelyLicenseById(userId, id);
    }

    @UseGuards(AdminUserGuard)
    @Post('add')
    async addData(@Body() newLicense: EditLicense): Promise<ReturnMessage> {
        return await this.licenseService.insertNewLicense(newLicense);
    }

    @UseGuards(AdminUserGuard)
    @Put('modify')
    async updateData(@Body() updateLicense: EditLicense): Promise<ReturnMessage> {
        return await this.licenseService.updateLicense(updateLicense);
    }

    @UseGuards(AdminUserGuard)
    @Put('change-order-home-license')
    async changeOrderHomeLicense(@Body() licenses: number[]): Promise<ReturnMessage> {
        return await this.licenseService.updateOrderLicenseByPosition(licenses, 1);
    }

    @UseGuards(AdminUserGuard)
    @Put('change-order-research-license')
    async changeOrderResearchLicense(@Body() licenses: number[]): Promise<ReturnMessage> {
        return await this.licenseService.updateOrderLicenseByPosition(licenses, 0);
    }

    @UseGuards(AdminUserGuard)
    @Delete('delete/:id')
    async deleteData(@Param('id', ParseIntPipe) id: number): Promise<ReturnMessage> {
        return await this.licenseService.deleteLicenseById(id);
    }

}
