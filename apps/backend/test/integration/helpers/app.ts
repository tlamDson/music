import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { JwtPayload } from '@cafe-music/shared';
import { AppModule } from '../../../src/app.module';
import { installBigIntJsonSupport } from '../../../src/common/bigint-json';
import { JwtAuthGuard } from '../../../src/modules/auth/guards/jwt-auth.guard';
import { RedisThrottlerStorage } from '../../../src/common/throttler/redis-throttler.storage';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RedisService } from '../../../src/modules/sync/redis.service';
import { S3Service } from '../../../src/modules/tracks/s3.service';
import { SyncGateway } from '../../../src/modules/sync/sync.gateway';
import { SyncService } from '../../../src/modules/sync/sync.service';
import { SchedulerService } from '../../../src/modules/scheduler/scheduler.service';

// `Store.startedAtTs` là BigInt. Không cài patch này thì mọi response chứa một
// bản ghi Store ném "Do not know how to serialize a BigInt" — main.ts gọi nó ở
// module scope nên code production không bao giờ thiếu, còn test thì phải tự gọi.
installBigIntJsonSupport();

export interface IntegrationApp {
  app: INestApplication;
  prisma: PrismaService;
  /** Đổi user cho request kế tiếp (chỉ có tác dụng khi `realAuth: false`). */
  setUser: (user: JwtPayload | null) => void;
  s3: {
    uploadFile: jest.Mock;
    getPresignedUrl: jest.Mock;
    deleteFile: jest.Mock;
  };
  gateway: {
    broadcastToStore: jest.Mock;
    countStoreClients: jest.Mock;
  };
  close: () => Promise<void>;
}

/**
 * `RedisService` và `RedisThrottlerStorage` đều tạo client với
 * `lazyConnect: true`, nên nếu suite không chạm tới Redis thì client chưa từng
 * kết nối — và `quit()` trên client như vậy ném `Connection is closed.`. Lỗi này
 * chỉ có ý nghĩa "không có gì để đóng", nuốt đúng nó và ném lại mọi lỗi khác.
 *
 * Production không dính vì `main.ts` không gọi `app.enableShutdownHooks()`, còn
 * `app.close()` của Nest testing thì luôn chạy `onApplicationShutdown`.
 */
async function ignoreClosedConnection(
  promise: Promise<unknown>,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Connection is closed')) throw error;
  }
}

export interface CreateIntegrationAppOptions {
  /**
   * `true` = giữ `JwtAuthGuard` thật, phải gửi Bearer token thật (dùng cho spec
   * kiểm chính luồng auth). Mặc định `false`: guard được stub để mỗi test tự
   * chọn vai trò mà không phải ký JWT.
   */
  realAuth?: boolean;
}

/**
 * Dựng app Nest THẬT với Postgres + Redis thật. Mỗi bước dưới đây né một cạm bẫy
 * cụ thể của việc boot `AppModule` dưới Jest — xem comment tại chỗ.
 */
export async function createIntegrationApp(
  options: CreateIntegrationAppOptions = {},
): Promise<IntegrationApp> {
  let currentUser: JwtPayload | null = null;

  class StubJwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      if (!currentUser) return false;
      const req = context.switchToHttp().getRequest<{ user: JwtPayload }>();
      req.user = currentUser;
      return true;
    }
  }

  const s3 = {
    uploadFile: jest.fn().mockResolvedValue({ key: 'stub-key' }),
    getPresignedUrl: jest.fn().mockResolvedValue('https://stub.invalid/track'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  // `app.init()` (không `listen`) để `SyncGateway.server` là undefined, mà
  // `broadcastToStore` gọi `this.server.to(...)` không có null guard → 500 ở mọi
  // route sync. Mock luôn, đằng nào WS cũng không phải thứ tầng này kiểm.
  const gateway = {
    broadcastToStore: jest.fn(),
    countStoreClients: jest.fn().mockReturnValue(0),
  };

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  })
    // `TracksService.remove()` gọi `s3.deleteFile()` TRƯỚC `prisma.track.delete()`
    // nên không stub là test xoá track phải có MinIO thật.
    .overrideProvider(S3Service)
    .useValue(s3)
    .overrideProvider(SyncGateway)
    .useValue(gateway)
    // `@Cron(EVERY_MINUTE) checkSchedules()` có thể gọi `syncService.playStore`
    // giữa suite. Thay bằng object thường → ScheduleModule không thấy metadata
    // cron nào để đăng ký.
    .overrideProvider(SchedulerService)
    .useValue({
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      remove: jest.fn(),
      checkSchedules: jest.fn(),
    })
    // Tắt rate limit bằng cách stub TẦNG STORAGE, không phải guard:
    // `ThrottlerGuard` được đăng ký `{ provide: APP_GUARD, useClass: ... }` nên
    // token provider là APP_GUARD — `overrideGuard(ThrottlerGuard)` không chạm
    // được nó (đã thử, suite auth vẫn ăn 429 từ `@Throttle` 5 login/60s theo
    // email). Storage stub luôn báo hit đầu tiên → guard thật vẫn chạy nhưng
    // không bao giờ chặn. Rate limit đã có login-throttle.spec (unit) + phép đo
    // thật trên staging lo, không phải việc của tầng này.
    .overrideProvider(RedisThrottlerStorage)
    .useValue({
      increment: jest
        .fn()
        .mockResolvedValue({ totalHits: 1, timeToExpire: 60_000 }),
    });

  if (!options.realAuth) {
    builder = builder.overrideGuard(JwtAuthGuard).useClass(StubJwtAuthGuard);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();

  // AppModule KHÔNG tự set prefix — nó nằm ở main.ts. Thiếu dòng này thì mọi
  // request /api/v1/... trả 404 và test đỏ vì lý do sai.
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    setUser: (user) => {
      currentUser = user;
    },
    s3,
    gateway,
    close: async () => {
      // `playStore` hẹn `setTimeout` theo durationMs của bài (auto-next server
      // lái). Map timer là field private của SyncService — không dọn thì Jest
      // không exit, và timer nổ sau khi DB đã truncate in "Auto-next failed"
      // ra log. Với tay vào private field là chấp nhận được trong helper test,
      // đổi lại không phải sửa src chỉ để phục vụ teardown.
      const sync = app.get(SyncService) as unknown as {
        advanceTimers: Map<string, NodeJS.Timeout>;
      };
      for (const timer of sync.advanceTimers.values()) clearTimeout(timer);
      sync.advanceTimers.clear();

      // RedisService KHÔNG implement OnModuleDestroy nên `app.close()` không
      // đóng client ioredis của nó → Jest treo với "open handles".
      await ignoreClosedConnection(app.get(RedisService).quit());
      // `app.close()` chạy `RedisThrottlerStorage.onApplicationShutdown()`, hàm
      // này cũng `quit()` vô điều kiện.
      await ignoreClosedConnection(app.close());
    },
  };
}
