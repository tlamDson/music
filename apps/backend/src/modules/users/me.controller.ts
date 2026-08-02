import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  UpdateProfileSchema,
  UpdateProfileDto,
  ChangePasswordSchema,
  ChangePasswordDto,
  JwtPayload,
} from '@cafe-music/shared';

/**
 * Prefix riêng `/me`, không phải route thêm vào `UsersController` (`/users`).
 * `UsersController` đã có `@Patch(':id')` và chỉ ORG_ADMIN gọi được
 * (`@Roles('ORG_ADMIN')` ở cấp class) — STORE_ADMIN cần tự sửa hồ sơ/mật khẩu
 * của chính mình nên không thể đi qua đó. Route tĩnh riêng cũng tránh hẳn cạm
 * bẫy `:id` nuốt mất `/users/me` tuỳ thứ tự đăng ký (xem tech-defaults.md).
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private usersService: UsersService) {}

  @Get()
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user);
  }

  @Patch()
  updateProfile(
    @Body(new ZodValidationPipe(UpdateProfileSchema))
    dto: UpdateProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.updateProfile(user, dto);
  }

  @Patch('password')
  changePassword(
    @Body(new ZodValidationPipe(ChangePasswordSchema))
    dto: ChangePasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.changePassword(user, dto);
  }
}
