export interface EditLicense {
    id: number,
    name: string,
    order: number,
    position: boolean,
    srcIcon: string | ArrayBuffer | undefined | null,
    srcLogo: string | ArrayBuffer | undefined | null,
    srcBackground: string | ArrayBuffer | undefined | null,
    isSelectionOrderRandom: boolean,
    isMediaOrderRandom: boolean,
    mediaList: number[],
    selectionList: number[]
}
