import { Module } from '@nestjs/common';
import { StreamService } from 'src/stream/service/stream.service';
import { StreamController } from 'src/stream/controller/stream.controller';

@Module({
  providers: [StreamService],
  controllers: [StreamController],
  exports: [StreamService]
})
export class StatUserModule { }
