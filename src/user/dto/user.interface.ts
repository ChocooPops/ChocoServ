import { Role } from "./role.enum"

export interface User {
    id: number,
    pseudo: string,
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    role: Role,
    dateBorn: Date,
    profilPhoto: string,
    createdAt: Date
}