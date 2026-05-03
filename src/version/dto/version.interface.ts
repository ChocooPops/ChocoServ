import { OS } from "./os.enum";

export interface Version {
    id: number,
    num: string,
    os: OS,
    link: string,
    createdAt: Date,
    updatedAt: Date
}