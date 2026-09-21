import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

// A separate named strategy ('platform-jwt') signed with its own secret
// (PLATFORM_JWT_SECRET, not JWT_SECRET) -- a superadmin session and a cafe
// staff session should never be interchangeable, even if one of the two
// tokens leaked. The `type` check below is a second layer on top of that:
// even a token that somehow validated against this secret has to actually
// claim to be a platform token to be accepted here.
@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('PLATFORM_JWT_SECRET')!,
    });
  }

  validate(payload: { sub: number; username: string; type: string }) {
    if (payload.type !== 'platform') {
      throw new UnauthorizedException();
    }
    return { platformUserId: payload.sub, username: payload.username };
  }
}
