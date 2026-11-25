import {
  BadRequestException, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';

const KINDS = ['menu', 'category', 'cover'] as const;
type Kind = (typeof KINDS)[number];

const EXT_BY_MIME: Record<string, string> = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

// One generic image endpoint instead of one per feature. The browser already
// crops + compresses to WebP before uploading (see web/lib/image.ts), so the
// server only has to validate and store -- no native image library needed,
// which keeps `npm install` painless on Windows and on a small VPS.
// Files land in public/uploads/<kind>/ and are served statically by main.ts.
@Controller('uploads')
export class UploadsController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('image/:kind')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!EXT_BY_MIME[file.mimetype]) {
          return cb(new BadRequestException('Only JPG, PNG or WebP images are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: CurrentUserPayload,
    @Param('kind') kind: string,
    @UploadedFile() file: { mimetype: string; buffer: Buffer; size: number } | undefined,
  ) {
    if (!KINDS.includes(kind as Kind)) throw new BadRequestException('Unknown upload kind');
    if (!file) throw new BadRequestException('No file uploaded');

    const dir = path.join(process.cwd(), 'public', 'uploads', kind);
    fs.mkdirSync(dir, { recursive: true });
    const name = `cafe-${user.cafeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${EXT_BY_MIME[file.mimetype]}`;
    fs.writeFileSync(path.join(dir, name), file.buffer);
    return { url: `/uploads/${kind}/${name}` };
  }
}
