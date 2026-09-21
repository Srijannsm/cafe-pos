import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard('platform-jwt') {}
