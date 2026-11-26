import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  // A signed token alone isn't enough: it lives for 12h, and in that time a
  // manager may deactivate the person or the platform may pause the cafe.
  // One primary-key lookup per request makes both take effect immediately.
  // Role and cafe come from the database too, so a demoted admin loses
  // admin rights right away instead of when their token expires.
  async validate(payload: { sub: number; name: string; role: string; cafeId: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { name: true, role: true, cafeId: true, isActive: true, cafe: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || !user.cafe.isActive || user.cafeId !== payload.cafeId) {
      throw new UnauthorizedException('Your session has ended -- please sign in again');
    }
    return { userId: payload.sub, name: user.name, role: user.role, cafeId: user.cafeId };
  }
}
