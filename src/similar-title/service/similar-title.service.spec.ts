import { Test, TestingModule } from '@nestjs/testing';
import { SimilarTitleService } from './similar-title.service';

describe('SimilarTitleService', () => {
  let service: SimilarTitleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SimilarTitleService],
    }).compile();

    service = module.get<SimilarTitleService>(SimilarTitleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
