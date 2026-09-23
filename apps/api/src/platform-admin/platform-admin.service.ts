import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCafeDto } from './dto/create-cafe.dto.js';
import { UpdateCafeDto } from './dto/update-cafe.dto.js';

const CAFE_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  vatEnabled: true,
  vatRate: true,
  panNumber: true,
  createdAt: true,
  _count: { select: { users: true, orders: true } },
} as const;

@Injectable()
export class PlatformAdminService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const [totalCafes, activeCafes, totalStaff, totalOrders] = await Promise.all([
      this.prisma.cafe.count(),
      this.prisma.cafe.count({ where: { isActive: true } }),
      this.prisma.user.count(),
      this.prisma.order.count(),
    ]);

    return { totalCafes, activeCafes, totalStaff, totalOrders };
  }

  findAllCafes() {
    return this.prisma.cafe.findMany({
      select: CAFE_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCafeDetail(id: number) {
    const cafe = await this.prisma.cafe.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        vatEnabled: true,
        vatRate: true,
        panNumber: true,
        createdAt: true,
        users: {
          select: { id: true, name: true, role: true, isActive: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { menuItems: true, tables: true, orders: true } },
      },
    });
    if (!cafe) {
      throw new NotFoundException(`Cafe ${id} does not exist`);
    }

    const recentOrders = await this.prisma.order.findMany({
      where: { cafeId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderType: true,
        status: true,
        total: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
      },
    });

    return { ...cafe, recentOrders };
  }

  async createCafe(dto: CreateCafeDto) {
    const existing = await this.prisma.cafe.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`A cafe with slug "${dto.slug}" already exists`);
    }

    const pinHash = await bcrypt.hash(dto.adminPin, 10);

    return this.prisma.cafe.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        users: {
          create: { name: dto.adminName, pinHash, role: 'admin' },
        },
      },
      select: CAFE_SUMMARY_SELECT,
    });
  }

  async updateCafe(id: number, dto: UpdateCafeDto) {
    const cafe = await this.prisma.cafe.findUnique({ where: { id } });
    if (!cafe) {
      throw new NotFoundException(`Cafe ${id} does not exist`);
    }

    // Build a partial update -- only touch the fields the caller actually sent
    const data: Record<string, unknown> = {};
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.vatEnabled !== undefined) data.vatEnabled = dto.vatEnabled;
    if (dto.vatRate !== undefined) data.vatRate = dto.vatRate;
    if ('panNumber' in dto) data.panNumber = dto.panNumber ?? null;

    return this.prisma.cafe.update({
      where: { id },
      data,
      select: CAFE_SUMMARY_SELECT,
    });
  }
}
