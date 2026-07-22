import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginSchema, RefreshTokenSchema } from '@cafe-music/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Siết chặt hơn mức mặc định toàn cục: chặn dò mật khẩu.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
