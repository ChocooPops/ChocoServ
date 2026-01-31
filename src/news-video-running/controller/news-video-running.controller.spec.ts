import { Test, TestingModule } from '@nestjs/testing';
import { NewsVideoRunningController } from './news-video-running.controller';

describe('NewsVideoRunningController', () => {
  let controller: NewsVideoRunningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewsVideoRunningController],
    }).compile();

    controller = module.get<NewsVideoRunningController>(NewsVideoRunningController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
