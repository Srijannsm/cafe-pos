import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = { user: { findUnique: vi.fn() } };
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
    it('rejects an unknown user id', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ userId: 1, pin: '9999' })).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong PIN without revealing whether the user exists', async () => {
      const pinHash = await bcrypt.hash('9999', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 1, name: 'Admin', role: 'admin', pinHash });

      await expect(service.login({ userId: 1, pin: '0000' })).rejects.toThrow(UnauthorizedException);
    });

    it('signs a token and returns the user on a matching PIN', async () => {
      const pinHash = await bcrypt.hash('9999', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 1, name: 'Admin', role: 'admin', pinHash });

      const result = await service.login({ userId: 1, pin: '9999' });

      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 1, name: 'Admin', role: 'admin' });
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        user: { id: 1, name: 'Admin', role: 'admin' },
      });
    });
  });
});
