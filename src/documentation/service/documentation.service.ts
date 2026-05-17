import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { StreamableFile } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class DocumentationService {

    private readonly pdfPath = join(process.cwd(), 'src/documentation/doc/doc-chocoplus.pdf');

    constructor(private readonly i18nService: I18nService) { }

    getMainPdf(): StreamableFile {
        if (!existsSync(this.pdfPath)) {
        throw new Error(this.i18nService.t("common.DOCUMENTATION.PDF_FILE_CANNOT_FOUND"));
        }
        const fileStream = createReadStream(this.pdfPath);
        return new StreamableFile(fileStream);
    }

}
