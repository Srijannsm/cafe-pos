import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';

// A 4-digit PIN is only 10,000 combinations, so unlimited guesses would
// crack one in minutes. After MAX_FAILS wrong PINs for the same staff member
// we refuse further tries for LOCK_MS. In-memory is enough for a single API
// process; move this to Redis if the API ever runs as several instances.
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

@Injectable()
export class AuthService {
  private failures = new Map<string, { count: number; lockedUntil: number }>();

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

    const key = `${cafe.id}:${user.id}`;
    const entry = this.failures.get(key);
    if (entry && entry.lockedUntil > Date.now()) {
      const secs = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      throw new HttpException(`Too many wrong PINs. Try again in ${secs}s.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const pinMatches = await bcrypt.compare(dto.pin, user.pinHash);

    if (!pinMatches) {
      const count = (entry && entry.lockedUntil <= Date.now() && entry.count >= MAX_FAILS ? 0 : entry?.count ?? 0) + 1;
      this.failures.set(key, { count, lockedUntil: count >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      throw new UnauthorizedException('Invalid credentials');
    }
    this.failures.delete(key);

    // A deactivated staff member keeps their row (for history) but can't sign in.
    if (!user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, name: user.name, role: user.role, cafeId: user.cafeId };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: { id: user.id, name: user.name, role: user.role, cafeId: user.cafeId, avatarUrl: user.avatarUrl },
    };
  }
}
