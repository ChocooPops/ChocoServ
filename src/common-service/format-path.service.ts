
import { Injectable } from '@nestjs/common';
import { basename } from 'path';
import { MediaType } from 'src/media/dto/media-type.enum';

@Injectable()
export class FormatPathService {

    private folderHost: string = 'http://localhost:3000';
    private folderUploads: string = 'uploads';
    private folderProfilPhoto: string = 'profil-photo';

    public formatPath(title: string): string {
        let formattedTitle = title.toLowerCase();
        formattedTitle = formattedTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        formattedTitle = formattedTitle.replace(/[^a-z0-9]+/g, '-');
        formattedTitle = formattedTitle.replace(/^-+|-+$/g, '');
        return formattedTitle;
    }

    public getFolderUploads(): string {
        return this.folderUploads;
    }

    public getUrlProfilPhoto(profilPhoto: string): string {
        return `${this.folderHost}/${this.folderUploads}/${this.folderProfilPhoto}/${profilPhoto}`;
    }

    public getPotserIdByUrl(url: string): number {
        const idString: string = basename(url).split('.')[0];
        return Number(idString);
    }

    public getOneFormatedPosterUrl(title: string, mediaType: MediaType, poster: string | null): string | null {
        if (poster) {
            const formatedTitle: string = this.formatPath(title);
            return `${this.folderHost}/${this.folderUploads}/${mediaType.toLowerCase()}/${formatedTitle}/${poster}`
        } else {
            return null;
        }
    }

    public getManyFormatedPosterUrl(title: string, mediaType: MediaType, posters: string[]): string[] {
        if (posters) {
            const formatedTitle: string = this.formatPath(title);
            const postersFormated: string[] = [];
            posters.forEach((poster: string) => {
                if (poster) {
                    postersFormated.push(`${this.folderHost}/${this.folderUploads}/${mediaType.toLowerCase()}/${formatedTitle}/${poster}`);
                }
            });
            return postersFormated;
        } else {
            return [];
        }
    }

}
