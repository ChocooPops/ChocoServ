import { Injectable } from '@nestjs/common';

@Injectable()
export class UserTabService {

    constructor() { }

    getUserTab(userId: number): number[] {
        return [userId, userId, userId, userId];
    }
    
}
