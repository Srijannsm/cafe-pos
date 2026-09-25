import {
  Controller, Get, Param, UseGuards, Patch, Body,
  Post, Delete, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CafesService } from './cafes.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { UpdateCafeSettingsDto } from './dto/update-cafe-settings.dto.js';

@Controller('cafes')
export class CafesController {
  constructor(private cafesService: CafesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my-plan')
  getMyPlan(@CurrentUser() user: CurrentUserPayload) {
    return this.cafesService.getPlanInfo(user.cafeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('settings')
  getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.cafesService.getSettings(user.cafeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('settings')
  updateSettings(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateCafeSettingsDto) {
    return this.cafesService.updateSettings(user.cafeId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('settings/logo')
  @UseInterceptors(FileInterceptor('logo', {
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new BadRequestException('Only image files are allowed'), false);
      }
      cb(null, true);
    },
  }))
  uploadLogo(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.cafesService.uploadLogo(user.cafeId, file);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('settings/logo')
  deleteLogo(@CurrentUser() user: CurrentUserPayload) {
    return this.cafesService.deleteLogo(user.cafeId);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cafesService.findPublicBySlug(slug);
  }

  @Get(':slug/staff')
  findStaffForLogin(@Param('slug') slug: string) {
    return this.cafesService.findStaffForLogin(slug);
  }
}
