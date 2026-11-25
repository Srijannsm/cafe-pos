import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UploadsController } from './uploads.controller.js';

// AuthModule exports PassportModule, which JwtAuthGuard needs (AuthModuleOptions).
@Module({ imports: [AuthModule], controllers: [UploadsController] })
export class UploadsModule {}
