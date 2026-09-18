import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MenuService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.menuItem.findMany({
      where: { isAvailable: true },
      include: { category: true, modifiers: true },
      orderBy: { category: { sortOrder: 'asc' } },
    });
  }
}