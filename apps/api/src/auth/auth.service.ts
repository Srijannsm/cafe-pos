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
    // The cafe slug in the URL scopes login just as much as the userId --
    // a PIN that's valid for a user at one cafe should never authenticate
    // them against a different cafe's slug, even if userId is a global id.
    const cafe = await this.prisma.cafe.findUnique({ where: { slug: dto.cafeSlug } });

    if (!cafe || !cafe.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });

    if (!user || user.cafeId !== cafe.id) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pinMatches = await bcrypt.compare(dto.pin, user.pinHash);

    if (!pinMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, name: user.name, role: user.role, cafeId: user.cafeId };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, name: user.name, role: user.role, cafeId: user.cafeId },
    };
  }
}
