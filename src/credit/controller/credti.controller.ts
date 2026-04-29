import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { CreditService } from '../service/credit.service';
import { Job } from '../dto/job.enum';
import { Credit } from '../dto/credit.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';

@Controller('credit')
export class CreditController {

    constructor(private readonly creditService: CreditService) { }

    @Get('job-filters')
    public getJobToFilters(): Job[] {
        return this.creditService.getJobToFilters();
    }

    @Get('research/:keyword')
    public async getCreditByResearch(@Param('keyword') keyword: string): Promise<Credit[]> {
        return await this.creditService.getCreditByResearch(keyword);
    }

    @Get(':creditId')
    public async getCreditById(@Param('creditId', ParseIntPipe) creditId: number): Promise<Credit> {
        return await this.creditService.getCreditById(creditId);
    }

    @Post('save-all-new-credit')
    public async saveAllNewCreditFromAllMedia(): Promise<any> {
        return await this.creditService.saveAllNewCreditFromAllMedia();
    }

    @Post('add')
    public async addNewCredit(@Body() newCredit: Credit): Promise<ReturnMessage> {
        return await this.creditService.addNewCredit(newCredit);
    }

    @Put('modify')
    public async modifyCredit(@Body() updateCredit: Credit): Promise<ReturnMessage> {
        return await this.creditService.modifyCredit(updateCredit);
    }

    @Delete('delete/:creditId')
    public async deleteCreditById(@Param('creditId', ParseIntPipe) creditId: number): Promise<ReturnMessage> {
        return await this.creditService.deleteCreditById(creditId);
    }

}
