import { Test, TestingModule } from '@nestjs/testing';
import { StatUserService } from './stat-user.service';

describe('StatUserService', () => {
  let service: StatUserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatUserService],
    }).compile();

    service = module.get<StatUserService>(StatUserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
