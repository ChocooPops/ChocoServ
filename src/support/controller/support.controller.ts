import { Controller, Get, Post, Body } from '@nestjs/common';
import { Support } from '../dto/support.interface';
import { FormSupport } from '../dto/form-support.interface';
import { ReturnMessage } from 'src/common-interface/return-message.interface';
import { SupportService } from '../service/support.service';

@Controller('support')
export class SupportController {

    constructor(private supportService: SupportService) { }

    @Get()
    public getAllFormToSupport(): Support[] {
        return this.supportService.getAllFormToSupport();
    }

    @Post()
    public async sendFormByEmail(@Body() form: FormSupport): Promise<ReturnMessage> {
        return await this.supportService.sendFormByEmail(form);
    }
}
