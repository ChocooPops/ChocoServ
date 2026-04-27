import { Controller, Get } from '@nestjs/common';
import { CreditService } from '../service/credit.service';
import { Job } from '../dto/job.enum';

@Controller('credit')
export class CreditController {

    constructor(private readonly creditService: CreditService) { }

    @Get('job-filters')
    public getJobToFilters(): Job[] {
        return this.creditService.getJobToFilters();
    }
}
