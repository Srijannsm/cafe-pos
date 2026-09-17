import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pinMatches = await bcrypt.compare(dto.pin, user.pinHash);

    if (!pinMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, name: user.name, role: user.role };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, name: user.name, role: user.role },
    };
  }
}