import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Shape JwtStrategy.validate() returns -- attached to the request as
// req.user by Passport once JwtAuthGuard has verified the token.
export interface CurrentUserPayload {
  userId: number;
  name: string;
  role: string;
  cafeId: number;
}

// Every route that touches cafe-scoped data needs cafeId out of the token,
// not out of a query param or the request body -- otherwise a request could
// just claim to belong to a different cafe. This decorator is the one place
// that reads it out of the request, so every controller gets it the same
// way instead of reaching into @Req() by hand.
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
