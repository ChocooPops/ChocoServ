import { Test, TestingModule } from '@nestjs/testing';
import { DocumentationController } from './documentation.controller';

describe('DocumentationController', () => {
  let controller: DocumentationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentationController],
    }).compile();

    controller = module.get<DocumentationController>(DocumentationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
