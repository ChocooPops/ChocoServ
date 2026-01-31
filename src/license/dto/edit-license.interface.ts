export interface EditLicense {
    id: number,
    name: string,
    order: number,
    position: boolean,
    srcIcon: string | ArrayBuffer | undefined | null,
    srcLogo: string | ArrayBuffer | undefined | null,
    srcBackground: string | ArrayBuffer | undefined | null,
    mediaList: number[],
    selectionList: number[]
}
