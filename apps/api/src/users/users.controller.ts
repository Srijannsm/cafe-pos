import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('login-options')
  findAllForLogin() {
    return this.usersService.findAllForLogin();
  }
}