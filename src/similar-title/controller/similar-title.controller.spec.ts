import { Test, TestingModule } from '@nestjs/testing';
import { SimilarTitleController } from './similar-title.controller';

describe('SimilarTitleController', () => {
  let controller: SimilarTitleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimilarTitleController],
    }).compile();

    controller = module.get<SimilarTitleController>(SimilarTitleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
