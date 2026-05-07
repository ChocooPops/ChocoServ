import { Injectable } from "@nestjs/common";
import * as path from 'path';
import * as fs from 'fs-extra';
import { ReturnMessage } from "src/common-interface/return-message.interface";
import { MediaType } from "src/media/dto/media-type.enum";
import { exec } from "child_process";
import { promisify } from "util";
const execPromise = promisify(exec);

@Injectable({})
export class UploadImageService {

    private readonly folderUploads: string = 'uploads';
    private readonly folderMovie: string = 'movie';
    private readonly folderSeries: string = 'series';
    private readonly folderLicense: string = 'license';
    private readonly folderCredit: string = 'credit';
    private readonly uploadDirToMovie: string = path.join(`${this.folderUploads}/${this.folderMovie}`);
    private readonly uploadDirToSeries: string = path.join(`${this.folderUploads}/${this.folderSeries}`);
    private readonly uploadDirToLicense: string = path.join(`${this.folderUploads}/${this.folderLicense}`);
    private readonly uploadDirToCredit: string = path.join(`${this.folderUploads}/${this.folderCredit}`);

    public getUploadDirToMovie(): string {
        return this.uploadDirToMovie;
    }
    public getUploadDirToSeries(): string {
        return this.uploadDirToSeries;
    }
    public getUploadDirToLicense(): string {
        return this.uploadDirToLicense;
    }
    public getUploadDirToCredit(): string {
        return this.uploadDirToCredit;
    }

    public getImageExtensionFromBase64(image: string | ArrayBuffer): string | null {
        let base64: string;

        if (image instanceof ArrayBuffer) {
            base64 = this.arrayBufferToBase64(image);
        } else {
            base64 = image;
        }

        const match = base64.match(/^data:image\/([a-zA-Z]+);base64,/);
        return match ? match[1] : null;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        const binary = Array.from(bytes).map(byte => String.fromCharCode(byte)).join('');
        return window.btoa(binary);
    }

    public isBase64Image(str: string | ArrayBuffer): boolean {
        if (str instanceof ArrayBuffer) {
            str = this.arrayBufferToBase64(str);
        }

        return typeof str === 'string' &&
            /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(str);
    }

    public async createDirectoryToMediaType(directoryName: string, mediaType: MediaType): Promise<ReturnMessage> {
        if (mediaType === MediaType.MOVIE) {
            const directoryPath = path.join(`${this.uploadDirToMovie}`, directoryName);
            return await this.createDirectory(directoryPath);
        } else if (mediaType === MediaType.SERIES) {
            const directoryPath = path.join(`${this.uploadDirToSeries}`, directoryName);
            return await this.createDirectory(directoryPath);
        }
    }

    public async createDirectcoryToLicense(directoryName: string): Promise<ReturnMessage> {
        const directoryPath = path.join(`${this.uploadDirToLicense}`, directoryName);
        return await this.createDirectory(directoryPath);
    }

    public async createDirectory(directoryPath: string): Promise<ReturnMessage> {
        try {
            await fs.ensureDir(directoryPath);
            return {
                id: 0,
                state: true,
                message: `Répertoire créé à : ${directoryPath}`
            };
        } catch (error: any) {
            return {
                id: -1,
                state: false,
                message: `Erreur lors de la création du répertoire : ${error.message}`
            };
        }
    }

    private async saveImage(image: string | ArrayBuffer, directory: string, filename: string): Promise<ReturnMessage> {
        try {
            const filePath = path.join(directory, filename);
            let imageBuffer: Buffer;
            if (image instanceof ArrayBuffer) {
                imageBuffer = Buffer.from(image);
            } else if (typeof image === 'string') {
                if (image.startsWith('data:image')) {
                    const matches = image.match(/^data:image\/([a-zA-Z]*);base64,([^\"]*)$/);
                    if (matches && matches[2]) {
                        imageBuffer = Buffer.from(matches[2], 'base64');
                    } else {
                        throw new Error('Format d\'image incorrect');
                    }
                } else {
                    imageBuffer = Buffer.from(image, 'base64');
                }
            } else {
                throw new Error('Type d\'image non supporté');
            }
            await fs.ensureDir(directory);
            await fs.writeFile(filePath, imageBuffer);
            const name: string = await this.convertToWebP(filePath);
            return {
                id: 0,
                state: true,
                message: `Image enregistrée à : ${filePath}`,
                other: name
            };
        } catch (error: any) {
            return {
                id: -1,
                state: false,
                message: 'Erreur lors de l\'enregistrement de l\'image : ' + error.message,
                other: null
            };
        }
    }

    public async saveImageToMediaType(image: string | ArrayBuffer, directory: string, filename: string, mediaType: MediaType): Promise<ReturnMessage> {
        if (mediaType === MediaType.MOVIE) {
            const directoryPath = path.join(`${this.uploadDirToMovie}`, directory);
            return await this.saveImage(image, directoryPath, filename);
        } else if (mediaType === MediaType.SERIES) {
            const directoryPath = path.join(`${this.uploadDirToSeries}`, directory);
            return await this.saveImage(image, directoryPath, filename);
        }
    }

    public async saveImageToLicense(image: string | ArrayBuffer, directory: string, filename: string): Promise<ReturnMessage> {
        const directoryPath = path.join(`${this.uploadDirToLicense}`, directory);
        return await this.saveImage(image, directoryPath, filename);
    }

    public async saveImageToCredit(image: string | ArrayBuffer, directory: string, filename: string): Promise<ReturnMessage> {
        const directoryPath = path.join(`${this.uploadDirToCredit}`, directory);
        return await this.saveImage(image, directoryPath, filename);
    }

    private async deleteFileOrFolder(path: string): Promise<ReturnMessage> {
        try {
            if (await fs.pathExists(path)) {
                await fs.remove(path);
                return {
                    id: 0,
                    state: true,
                    message: `Succès de la Suppression du fichier : ${path}`
                }
            } else {
                return {
                    id: 0,
                    state: true,
                    message: `Erreur : Le fichier ou dossier "${path}" n'existe pas.`
                }
            }
        } catch (error: any) {
            return {
                id: 0,
                state: true,
                message: `Erreur lors de la suppression de "${path}": ${error.message}`
            }
        }
    }

    public async deleteFileOrDirectoryToMediaType(directory: string, mediaType: MediaType): Promise<ReturnMessage> {
        if (mediaType === MediaType.MOVIE) {
            const pathDirecotry = path.join(`${this.uploadDirToMovie}/${directory}`);
            return this.deleteFileOrFolder(pathDirecotry);
        } else if (mediaType === MediaType.SERIES) {
            const pathDirecotry = path.join(`${this.uploadDirToSeries}/${directory}`);
            return this.deleteFileOrFolder(pathDirecotry);
        }
    }

    public async deleteFileOrDirectoryToLicense(directory: string): Promise<ReturnMessage> {
        const pathDirecotry = path.join(`${this.uploadDirToLicense}/${directory}`);
        return this.deleteFileOrFolder(pathDirecotry);
    }

    public async deleteFileOrDirectoryToCredit(directory: string): Promise<ReturnMessage> {
        const pathDirecotry = path.join(`${this.uploadDirToCredit}/${directory}`);
        return this.deleteFileOrFolder(pathDirecotry);
    }

    private async convertToWebP(inputPath: string): Promise<string> {
        const extension: string = path.extname(inputPath).toLocaleLowerCase();
        if (extension !== '.webp') {
            const parsedPath = path.parse(inputPath);
            const outputPath: string = path.join(parsedPath.dir, `${parsedPath.name}.webp`);
            const command: string = `ffmpeg -i ${inputPath} -c:v libwebp -y ${outputPath}`;
            const { stdout } = await execPromise(command);
            await this.deleteFileOrFolder(inputPath);
            return path.basename(outputPath);
        } else {
            return path.basename(inputPath);
        }
    }

    public getBasename(url: string): string {
        return path.basename(url);
    }

}