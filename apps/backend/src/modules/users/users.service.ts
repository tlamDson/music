import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisThrottlerStorage } from '../../common/throttler/redis-throttler.storage';
import {
  JwtPayload,
  UpdateProfileDto,
  ChangePasswordDto,
} from '@cafe-music/shared';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['ORG_ADMIN', 'STORE_ADMIN']),
  storeId: z.string().min(1).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ORG_ADMIN', 'STORE_ADMIN']).optional(),
  storeId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private redisThrottler: RedisThrottlerStorage,
  ) {}

  async findAll(user: JwtPayload) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId! },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: users };
  }

  async create(dto: CreateUserDto, user: JwtPayload) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        organizationId: user.organizationId!,
        storeId: dto.storeId ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
      },
    });

    return created;
  }

  async update(id: string, dto: UpdateUserDto, user: JwtPayload) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: user.organizationId! },
    });
    if (!target) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        storeId: dto.storeId,
        isActive: dto.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
      },
    });
  }

  /**
   * Hồ sơ của chính người gọi — tra theo `user.email`, không bao giờ từ tham
   * số. **Không dùng `user.sub`**: `@CurrentUser()` được khai kiểu `JwtPayload`
   * nhưng `JwtStrategy.validate()` trả thẳng bản ghi Prisma `User` (qua
   * `AuthService.validateJwtPayload`), không phải payload JWT gốc — object đó
   * có `id`, không có `sub`. Hai field trùng tên (`role`/`organizationId`/
   * `storeId`/`email`) nên chỗ khác không lộ ra; `sub` là field duy nhất tồn
   * tại trên `JwtPayload` mà không tồn tại trên `User`, và tra bằng nó luôn ra
   * `undefined` → Prisma ném lỗi thiếu `where`. `email` vừa có trong kiểu khai
   * báo vừa có thật trên object runtime nên tra theo nó thì đúng ở cả hai phía.
   */
  async getProfile(user: JwtPayload) {
    const record = await this.prisma.user.findUnique({
      where: { email: user.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
        store: { select: { name: true } },
      },
    });
    if (!record) throw new NotFoundException('User not found');
    return record;
  }

  /**
   * Chỉ ghi `name` — schema chỉ có field này, nhưng vẫn chọn tường minh thay
   * vì `...dto` để field lạ (role/storeId/isActive) không lọt qua nếu schema
   * đổi sau này. Cho tự đổi role là leo thang đặc quyền, cho tự đổi isActive
   * là tự bật lại tài khoản vừa bị vô hiệu hoá.
   */
  async updateProfile(user: JwtPayload, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { email: user.email },
      data: { name: dto.name },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Điểm dò mật khẩu thứ hai sau /auth/login. Đếm trực tiếp qua
   * `RedisThrottlerStorage` (không phải `@Throttle` decorator) vì
   * `ThrottlerGuard` toàn cục chạy trước `JwtAuthGuard` của route này nên
   * `req.user` chưa có lúc tracker của decorator chạy — key theo `user.email`
   * chỉ lấy được ở đây, sau khi JwtAuthGuard đã xác thực xong. (Không dùng
   * `user.sub` — xem chú thích ở `getProfile`.)
   */
  async changePassword(user: JwtPayload, dto: ChangePasswordDto) {
    const { isBlocked } = await this.redisThrottler.increment(
      `me-password:${user.email}`,
      60_000,
      5,
      0,
      'default',
    );
    if (isBlocked) {
      throw new HttpException(
        'Too many attempts, try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const record = await this.prisma.user.findUnique({
      where: { email: user.email },
    });
    if (!record) throw new NotFoundException('User not found');

    const matches = await bcrypt.compare(
      dto.currentPassword,
      record.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const samePassword = await bcrypt.compare(
      dto.newPassword,
      record.passwordHash,
    );
    if (samePassword) {
      throw new BadRequestException(
        'New password must be different from the current one',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { email: user.email },
      data: { passwordHash },
    });

    return { message: 'Password updated' };
  }
}
