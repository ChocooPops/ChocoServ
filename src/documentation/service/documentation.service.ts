import { Injectable } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { StreamableFile } from '@nestjs/common';

@Injectable()
export class DocumentationService {

    private readonly pdfPath = join(process.cwd(), 'src/documentation/doc/doc-chocoplus.pdf');

    getMainPdf(): StreamableFile {
        if (!existsSync(this.pdfPath)) {
        throw new Error('Le fichier PDF est introuvable.');
        }
        const fileStream = createReadStream(this.pdfPath);
        return new StreamableFile(fileStream);
    }

}
