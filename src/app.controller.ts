import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './guard/public.decorator';

@Controller()
export class AppController {
  
  constructor(private readonly appService: AppService) { }

  @Public()
  @Get()
  getHello(): any {
    return { message: this.appService.getHello() };
  }

}
