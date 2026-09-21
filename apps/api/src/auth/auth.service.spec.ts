import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    cafe: { findUnique: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };

  const dto = { cafeSlug: 'mittho-cafe', userId: 1, pin: '9999' };

  beforeEach(async () => {
    prisma = {
      cafe: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
    };
    jwtService = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('rejects an unknown or inactive cafe slug', async () => {
      prisma.cafe.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a user id that exists but belongs to a different cafe', async () => {
      prisma.cafe.findUnique.mockResolvedValue({ id: 1, slug: 'mittho-cafe', isActive: true });
      prisma.user.findUnique.mockResolvedValue({ id: 1, cafeId: 2, name: 'Admin', role: 'admin', pinHash: 'x' });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong PIN without revealing whether the user exists', async () => {
      const pinHash = await bcrypt.hash('9999', 10);
      prisma.cafe.findUnique.mockResolvedValue({ id: 1, slug: 'mittho-cafe', isActive: true });
      prisma.user.findUnique.mockResolvedValue({ id: 1, cafeId: 1, name: 'Admin', role: 'admin', pinHash });

      await expect(service.login({ ...dto, pin: '0000' })).rejects.toThrow(UnauthorizedException);
    });

    it('signs a token scoped to the cafe and returns the user on a matching PIN', async () => {
      const pinHash = await bcrypt.hash('9999', 10);
      prisma.cafe.findUnique.mockResolvedValue({ id: 1, slug: 'mittho-cafe', isActive: true });
      prisma.user.findUnique.mockResolvedValue({ id: 1, cafeId: 1, name: 'Admin', role: 'admin', pinHash });

      const result = await service.login(dto);

      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 1,
        name: 'Admin',
        role: 'admin',
        cafeId: 1,
      });
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        user: { id: 1, name: 'Admin', role: 'admin', cafeId: 1 },
      });
    });
  });
});
