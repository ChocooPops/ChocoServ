import { Test, TestingModule } from '@nestjs/testing';
import { NewsVideoRunningService } from './news-video-running.service';

describe('NewsVideoRunningService', () => {
  let service: NewsVideoRunningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NewsVideoRunningService],
    }).compile();

    service = module.get<NewsVideoRunningService>(NewsVideoRunningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
