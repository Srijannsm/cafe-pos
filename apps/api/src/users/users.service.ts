import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const ADMIN_SAFE_SELECT = {
  id: true,
  name: true,
  role: true,
  isActive: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAllForLogin() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
    });
  }

  findAllForAdmin() {
    return this.prisma.user.findMany({
      select: ADMIN_SAFE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new BadRequestException(`A staff member named "${dto.name}" already exists`);
    }

    const pinHash = await bcrypt.hash(dto.pin, 10);
    return this.prisma.user.create({
      data: { name: dto.name, role: dto.role, pinHash },
      select: ADMIN_SAFE_SELECT,
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOrThrow(id);

    if (dto.name) {
      const clash = await this.prisma.user.findUnique({ where: { name: dto.name } });
      if (clash && clash.id !== id) {
        throw new BadRequestException(`A staff member named "${dto.name}" already exists`);
      }
    }

    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        isActive: dto.isActive,
        ...(pinHash ? { pinHash } : {}),
      },
      select: ADMIN_SAFE_SELECT,
    });
  }

  private async findOrThrow(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} does not exist`);
    }
    return user;
  }
}
