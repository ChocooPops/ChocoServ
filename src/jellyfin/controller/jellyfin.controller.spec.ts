import { Test, TestingModule } from '@nestjs/testing';
import { JellyfinController } from './jellyfin.controller';

describe('JellyfinController', () => {
  let controller: JellyfinController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JellyfinController],
    }).compile();

    controller = module.get<JellyfinController>(JellyfinController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
