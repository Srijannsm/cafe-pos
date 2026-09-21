import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CafesService {
  constructor(private prisma: PrismaService) {}

  // Every other lookup in this module goes through here first -- the slug
  // in the URL is the only thing identifying which cafe's data a request
  // is even allowed to touch before anyone has logged in.
  async findBySlugOrThrow(slug: string) {
    const cafe = await this.prisma.cafe.findUnique({ where: { slug } });
    if (!cafe || !cafe.isActive) {
      throw new NotFoundException(`No cafe found for "${slug}"`);
    }
    return cafe;
  }

  // Public, pre-login: the /c/:slug/login page calls this to confirm the
  // slug is real and get a display name, before it ever shows a PIN pad.
  async findPublicBySlug(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return { id: cafe.id, name: cafe.name, slug: cafe.slug };
  }

  // Public, pre-login: replaces the old global /users/login-options --
  // that used to list every active user across every cafe, which is
  // obviously wrong once there's more than one cafe on the platform.
  async findStaffForLogin(slug: string) {
    const cafe = await this.findBySlugOrThrow(slug);
    return this.prisma.user.findMany({
      where: { cafeId: cafe.id, isActive: true },
      select: { id: true, name: true, role: true },
    });
  }
}
