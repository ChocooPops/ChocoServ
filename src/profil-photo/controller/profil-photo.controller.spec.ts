import { Test, TestingModule } from '@nestjs/testing';
import { ProfilPhotoController } from './profil-photo.controller';

describe('ProfilPhotoController', () => {
  let controller: ProfilPhotoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilPhotoController],
    }).compile();

    controller = module.get<ProfilPhotoController>(ProfilPhotoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
