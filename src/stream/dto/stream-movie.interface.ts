import { TypeStream } from "./type-stream.enum";

export interface StreamMovie {
    id: number,
    movieId: number,
    path: string,
    type: TypeStream,
    language: string,
}