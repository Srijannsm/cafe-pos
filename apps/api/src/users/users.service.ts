import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { assertNotOverdue, assertStaffLimit } from '../subscription/plan-limits.js';

const ADMIN_SAFE_SELECT = {
  id: true,
  name: true,
  role: true,
  isActive: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAllForAdmin(cafeId: number) {
    return this.prisma.user.findMany({
      where: { cafeId },
      select: ADMIN_SAFE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(cafeId: number, dto: CreateUserDto) {
    // Fetch cafe subscription state and current staff count together
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true },
    });

    assertNotOverdue(cafe);

    const staffCount = await this.prisma.user.count({ where: { cafeId } });
    assertStaffLimit(cafe, staffCount);

    const existing = await this.prisma.user.findUnique({
      where: { cafeId_name: { cafeId, name: dto.name } },
    });
    if (existing) {
      throw new BadRequestException(`A staff member named "${dto.name}" already exists`);
    }

    const pinHash = await bcrypt.hash(dto.pin, 10);
    return this.prisma.user.create({
      data: { name: dto.name, role: dto.role, pinHash, cafeId },
      select: ADMIN_SAFE_SELECT,
    });
  }

  async update(cafeId: number, id: number, dto: UpdateUserDto) {
    await this.findOrThrow(cafeId, id);

    if (dto.name) {
      const clash = await this.prisma.user.findUnique({
        where: { cafeId_name: { cafeId, name: dto.name } },
      });
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

  private async findOrThrow(cafeId: number, id: number) {
    const user = await this.prisma.user.findFirst({ where: { id, cafeId } });
    if (!user) {
      throw new NotFoundException(`User ${id} does not exist`);
    }
    return user;
  }
}
