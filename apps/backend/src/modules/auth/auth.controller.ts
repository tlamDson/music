import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { loginIdentityTracker } from '../../common/throttler/client-ip.tracker';
import { LoginSchema, RefreshTokenSchema } from '@cafe-music/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Siết chặt hơn mức mặc định toàn cục: chặn dò mật khẩu. Đếm theo email đang
  // bị dò chứ không theo IP — `req.ip` sau proxy của Railway không ổn định nên
  // đếm theo nó thì brute-force lọt qua (xem `loginIdentityTracker`).
  @Throttle({
    default: { limit: 5, ttl: 60000, getTracker: loginIdentityTracker },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(LoginSchema))
    body: {
      email: string;
      password: string;
    },
  ) {
    return this.authService.login(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema))
    body: {
      refreshToken: string;
    },
  ) {
    return this.authService.refreshTokens(body.refreshToken);
  }
}
