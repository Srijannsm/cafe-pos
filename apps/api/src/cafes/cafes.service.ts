import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TRIAL_DAYS, allPlans, cyclePrice, effectivePlan, getPlan, serializePlan, type PlanKey } from '../subscription/plan-limits.js';
import { UpdateCafeSettingsDto } from './dto/update-cafe-settings.dto.js';
import * as fs from 'fs';
import * as path from 'path';
import { IMAGE_EXT_BY_MIME } from '../uploads/image-check.js';


const SETTINGS_SELECT = {
  name: true, slug: true, logoUrl: true, themeColor: true,
  coverImageUrl: true, tagline: true, fontStyle: true, menuLayout: true,
  phone: true, address: true, wifiName: true, wifiPassword: true,
  instagram: true, facebook: true, tiktok: true, receiptFooter: true,
  vatEnabled: true, vatRate: true, panNumber: true, pricesIncludeVat: true, serviceChargeRate: true,
  inventoryEnabled: true, gamesEnabled: true,
} as const;

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
    return {
      id: cafe.id, name: cafe.name, slug: cafe.slug, logoUrl: cafe.logoUrl,
      themeColor: cafe.themeColor, coverImageUrl: cafe.coverImageUrl, tagline: cafe.tagline, fontStyle: cafe.fontStyle,
    };
  }

  async findStaffForLogin(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return this.prisma.user.findMany({
      where: { cafeId: cafe.id, isActive: true },
      select: { id: true, name: true, role: true, avatarUrl: true },
    });
  }

  /** Returns full cafe settings (branding, billing, features). */
  async getSettings(cafeId: number) {
    return this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: SETTINGS_SELECT,
    });
  }

  /** Partial update -- only the fields sent are changed. */
  async updateSettings(cafeId: number, dto: UpdateCafeSettingsDto) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      // Empty strings clear optional text fields rather than storing "".
      data[key] = typeof value === 'string' ? value.trim() || null : value;
    }
    if (data.name === null) delete data.name;
    return this.prisma.cafe.update({ where: { id: cafeId }, data, select: SETTINGS_SELECT });
  }

  /** Save uploaded logo file and store its public URL */
  async uploadLogo(cafeId: number, file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    // Save to public/uploads/logos/
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'logos');
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Extension from the verified type, never from the uploaded file name.
    const ext = IMAGE_EXT_BY_MIME[file.mimetype] ?? '.jpg';
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

  /** The cafe's plan, what it includes, usage against limits, and the other plans (for the upgrade table). */
  async getPlanInfo(cafeId: number) {
    const cafe = await this.prisma.cafe.findUniqueOrThrow({
      where: { id: cafeId },
      select: { plan: true, subscriptionStatus: true, nextBillingAt: true, billingCycle: true, trialStartedAt: true },
    });
    const limits = serializePlan(effectivePlan(cafe));

    const [staffCount, menuItemCount, tableCount] = await Promise.all([
      this.prisma.user.count({ where: { cafeId } }),
      this.prisma.menuItem.count({ where: { cafeId } }),
      this.prisma.restaurantTable.count({ where: { cafeId } }),
    ]);

    return {
      plan: cafe.plan,
      planName: getPlan(cafe.plan as PlanKey).name,
      billingCycle: cafe.billingCycle,
      price: cyclePrice(cafe.plan as PlanKey, cafe.billingCycle),
      subscriptionStatus: cafe.subscriptionStatus,
      nextBillingAt: cafe.nextBillingAt,
      trialEndsAt: new Date(cafe.trialStartedAt.getTime() + TRIAL_DAYS * 86400000),
      isOverdue: cafe.subscriptionStatus === 'overdue',
      features: {
        qrOrdering: limits.qrOrdering,
        reports: limits.reports,
        inventory: limits.inventory,
        tableGame: limits.tableGame,
        maxStaff: limits.maxStaff,
        maxMenuItems: limits.maxMenuItems,
        maxTables: limits.maxTables,
      },
      usage: { staffCount, menuItemCount, tableCount },
      plans: allPlans().map(serializePlan),
    };
  }
}
