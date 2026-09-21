import { Test, TestingModule } from '@nestjs/testing';
import { UserTabService } from './user-tab.service';

describe('UserTabService', () => {
  let service: UserTabService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserTabService],
    }).compile();

    service = module.get<UserTabService>(UserTabService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
