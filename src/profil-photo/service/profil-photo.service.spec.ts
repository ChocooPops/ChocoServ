import { Test, TestingModule } from '@nestjs/testing';
import { ProfilPhotoService } from './profil-photo.service';

describe('ProfilPhotoService', () => {
  let service: ProfilPhotoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProfilPhotoService],
    }).compile();

    service = module.get<ProfilPhotoService>(ProfilPhotoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
