import { Test, TestingModule } from '@nestjs/testing';
import { StatUserController } from './stat-user.controller';

describe('StatUserController', () => {
  let controller: StatUserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatUserController],
    }).compile();

    controller = module.get<StatUserController>(StatUserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
