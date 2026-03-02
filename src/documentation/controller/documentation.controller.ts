import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { DocumentationService } from '../service/documentation.service';

@Controller('documentation')
export class DocumentationController {

    constructor(private readonly documentation: DocumentationService) { }

    @Get()
    getPdf(@Res({ passthrough: true }) res: Response) {
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="sample.pdf"',
        });
        return this.documentation.getMainPdf();
    }

}
