import { Test, TestingModule } from '@nestjs/testing';
import { MenuService } from './menu.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('MenuService', () => {
  let service: MenuService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenuService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get<MenuService>(MenuService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
