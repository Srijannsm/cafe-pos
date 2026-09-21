import { Body, Controller, Post } from '@nestjs/common';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformLoginDto } from './dto/platform-login.dto.js';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private platformAuthService: PlatformAuthService) {}

  @Post('login')
  login(@Body() dto: PlatformLoginDto) {
    return this.platformAuthService.login(dto);
  }
}
