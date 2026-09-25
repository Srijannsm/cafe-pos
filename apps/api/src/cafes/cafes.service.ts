import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PLAN_LIMITS } from '../subscription/plan-limits.js';
import { UpdateCafeSettingsDto } from './dto/update-cafe-settings.dto.js';
import * as fs from 'fs';
import * as path from 'path';

type PlanKey = keyof typeof PLAN_LIMITS;

@Injectable()
export class CafesService {
  constructor(private prisma: PrismaService) {}

  async findBySlugOrThrow(slug: string) {
    const cafe = await this.prisma.cafe.findUnique({ where: { slug } });
    if (!cafe || !cafe.isActive) {
      throw new NotFoundException(`No cafe found for "${slug}"`);
    }
    return cafe;
  }

  async findPublicBySlug(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return { id: cafe.id, name: cafe.name, slug: cafe.slug };
  }

  async findStaffForLogin(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return this.prisma.user.findMany({
      where: { cafeId: cafe.id, isActive: true },
      select: { id: true, name: true, role: true },
    });
  }

  /** Returns full cafe settings for the admin settings page */
  async getSettings(cafeId: number) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        themeColor: true,
        vatEnabled: true,
        vatRate: true,
        panNumber: true,
      },
    });
    return cafe;
  }

  /** Update name and/or themeColor */
  async updateSettings(cafeId: number, dto: UpdateCafeSettingsDto) {
    return this.prisma.cafe.update({
      where: { id: cafeId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.themeColor !== undefined && { themeColor: dto.themeColor }),
      },
      select: { name: true, slug: true, logoUrl: true, themeColor: true },
    });
  }

  /** Save uploaded logo file and store its public URL */
  async uploadLogo(cafeId: number, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    // Save to public/uploads/logos/
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = (rawExt === '.jfif' || rawExt === '.jpeg') ? '.jpg' : (rawExt || '.jpg');
    const filename = `cafe-${cafeId}-${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const logoUrl = `/uploads/logos/${filename}`;
    await this.prisma.cafe.update({
      where: { id: cafeId },
      data: { logoUrl },
    });
    return { logoUrl };
  }

  /** Remove logo */
  async deleteLogo(cafeId: number) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({ where: { id: cafeId }, select: { logoUrl: true } });
    if (cafe.logoUrl) {
      const filePath = path.join(process.cwd(), 'public', cafe.logoUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await this.prisma.cafe.update({ where: { id: cafeId }, data: { logoUrl: null } });
    return { logoUrl: null };
  }

  /** Returns the cafe's plan info and feature flags for frontend gating. */
  async getPlanInfo(cafeId: number) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true, nextBillingAt: true },
    });

    const planKey: PlanKey =
      cafe.subscriptionStatus === 'trial' ? 'trial' : ((cafe.plan ?? 'starter') as PlanKey);

    const limits = PLAN_LIMITS[planKey];

    const [staffCount, menuItemCount, tableCount] = await Promise.all([
      this.prisma.user.count({ where: { cafeId } }),
      this.prisma.menuItem.count({ where: { cafeId } }),
      this.prisma.restaurantTable.count({ where: { cafeId } }),
    ]);

    return {
      plan: cafe.plan,
      subscriptionStatus: cafe.subscriptionStatus,
      nextBillingAt: cafe.nextBillingAt,
      isOverdue: cafe.subscriptionStatus === 'overdue',
      features: {
        qrOrdering: limits.qrOrdering,
        reports: limits.reports,
        maxStaff: limits.maxStaff === Infinity ? null : limits.maxStaff,
        maxMenuItems: limits.maxMenuItems === Infinity ? null : limits.maxMenuItems,
        maxTables: limits.maxTables === Infinity ? null : limits.maxTables,
      },
      usage: { staffCount, menuItemCount, tableCount },
    };
  }
}
