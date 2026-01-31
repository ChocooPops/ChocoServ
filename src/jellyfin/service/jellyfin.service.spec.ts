import { Test, TestingModule } from '@nestjs/testing';
import { JellyfinService } from './jellyfin.service';

describe('JellyfinService', () => {
  let service: JellyfinService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JellyfinService],
    }).compile();

    service = module.get<JellyfinService>(JellyfinService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
