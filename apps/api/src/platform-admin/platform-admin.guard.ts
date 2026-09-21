import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Gates the internal cafe-onboarding endpoints. Deliberately NOT part of
// the per-cafe JWT/Roles system used everywhere else: onboarding a new
// cafe happens before that cafe (and its admin user) exists, so there's
// no cafe-scoped admin to authenticate as yet. A single shared secret,
// set via PLATFORM_ADMIN_SECRET and sent as the x-platform-secret header,
// is enough for one-person internal use -- revisit with real accounts if
// more than one person ever needs to onboard cafes.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('PLATFORM_ADMIN_SECRET');
    if (!expected) {
      throw new UnauthorizedException('Platform admin access is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-platform-secret'];
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid platform admin secret');
    }

    return true;
  }
}
