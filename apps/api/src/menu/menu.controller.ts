import { Controller, Get, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('menu')
export class MenuController {
    constructor(private menuService: MenuService) {}

    @Get()
    findAll(){
        return this.menuService.findAll();
    }
}

