import { RegisterUser } from "src/user/dto/register-user.interface";

export interface VerificationCodeModel {
    id: number;
    user: RegisterUser;
    code: number;
}