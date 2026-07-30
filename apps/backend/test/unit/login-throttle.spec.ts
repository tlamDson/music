import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { clientIpTracker } from '../../src/common/throttler/client-ip.tracker';

type StorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

/**
 * Đếm bằng Map, không hẹn giờ — bản in-memory thật của @nestjs/throttler đặt
 * `setTimeout` cho mỗi hit và làm worker của Jest không thoát được.
 */
class CountingStorage {
  readonly hits = new Map<string, number>();

  increment(key: string, _ttl: number, limit: number): Promise<StorageRecord> {
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    const isBlocked = totalHits > limit;
    return Promise.resolve({
      totalHits,
      timeToExpire: 60,
      isBlocked,
      timeToBlockExpire: isBlocked ? 60 : 0,
    });
  }
}

/**
 * Đây là bài kiểm tra thật sự của việc chặn brute-force: đo trên staging cho
 * thấy khoá theo IP KHÔNG chặn được vì `req.ip` của cùng một client xoay giữa
 * nhiều giá trị sau proxy của Railway (X-RateLimit-Remaining chạy 4,4,3,3,2,2
 * và không bao giờ ra 429). Test dựng app thật + supertest vì lỗi nằm ở tầng
 * guard/decorator — gọi thẳng method controller không thể thấy.
 */
describe('POST /auth/login throttling', () => {
  let app: INestApplication;
  let storage: CountingStorage;

  const authService = {
    login: jest.fn(),
    refreshTokens: jest.fn(),
  };

  beforeEach(async () => {
    authService.login.mockRejectedValue(new UnauthorizedException());
    storage = new CountingStorage();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60000, limit: 100 }],
          storage,
          getTracker: clientIpTracker,
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
    app = nestApp;
    // Giống production: Railway đứng trước app nên Express suy req.ip từ
    // X-Forwarded-For thay vì socket.
    nestApp.set('trust proxy', 1);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  const attempt = (email: string, forwardedFor: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', forwardedFor)
      .send({ email, password: 'wrong-password' });

  it('blocks a sixth attempt on the same account even when the source ip keeps changing', async () => {
    const codes: number[] = [];

    for (let i = 0; i < 6; i++) {
      // Mô phỏng đúng thứ quan sát được trên Railway: edge round-robin qua hai
      // địa chỉ nên mỗi request lại mang một req.ip khác.
      const res = await attempt('victim@cafe.vn', `203.0.113.${i % 2}`);
      codes.push(res.status);
    }

    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
  });

  it('counts each account separately so one attack cannot lock everyone out', async () => {
    for (let i = 0; i < 6; i++) {
      await attempt('victim@cafe.vn', '203.0.113.1');
    }

    const other = await attempt('someone-else@cafe.vn', '203.0.113.1');

    expect(other.status).toBe(401);
  });

  it('does not let case or padding reset the counter', async () => {
    for (let i = 0; i < 5; i++) {
      await attempt('victim@cafe.vn', '203.0.113.1');
    }

    const disguised = await attempt('  VICTIM@Cafe.VN  ', '203.0.113.1');

    expect(disguised.status).toBe(429);
  });
});
