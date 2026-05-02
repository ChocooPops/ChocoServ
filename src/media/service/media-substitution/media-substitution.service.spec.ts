import { Test, TestingModule } from '@nestjs/testing';
import { MediaSubstitutionSerivce } from './media-substitution.service';

describe('MediaSubstitutionSerivce', () => {
  let service: MediaSubstitutionSerivce;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaSubstitutionSerivce],
    }).compile();

    service = module.get<MediaSubstitutionSerivce>(MediaSubstitutionSerivce);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
