import { Test, TestingModule } from '@nestjs/testing';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

describe('MenuController', () => {
  let controller: MenuController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [{ provide: MenuService, useValue: {} }],
    }).compile();

    controller = module.get<MenuController>(MenuController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
