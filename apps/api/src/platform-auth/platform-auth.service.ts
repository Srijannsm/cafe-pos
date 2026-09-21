import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformLoginDto } from './dto/platform-login.dto.js';

@Injectable()
export class PlatformAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: PlatformLoginDto) {
    const user = await this.prisma.platformUser.findUnique({ where: { username: dto.username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username, type: 'platform' };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, username: user.username },
    };
  }
}
