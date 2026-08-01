import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { ConfigModule } from '@nestjs/config';
import { StoresModule } from '../../src/modules/stores/stores.module';
import { StoresService } from '../../src/modules/stores/stores.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { S3Service } from '../../src/modules/tracks/s3.service';
import { RedisService } from '../../src/modules/sync/redis.service';

/**
 * `StoresService` inject `SyncService` **và** `SyncGateway` (để trả "đang phát
 * gì" + số màn hình đang kết nối). Nest chỉ cấp được provider mà module nguồn
 * `exports` — thiếu `SyncGateway` trong exports của `SyncModule` thì app chết
 * ngay lúc boot với "Nest can't resolve dependencies of StoresService".
 *
 * Unit test thường của `StoresService` không bắt được lỗi này vì nó tự cấp
 * provider giả; phải dựng đúng đồ thị module thật mới thấy.
 */
describe('StoresModule (dependency wiring)', () => {
  it('dựng được StoresService từ đồ thị module thật', async () => {
    const moduleRef = await Test.createTestingModule({
      // PrismaModule là @Global nhưng vẫn phải được import một lần thì provider
      // mới có mặt trong đồ thị để override.
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        StoresModule,
      ],
    })
      // Chỉ chặn những thứ chạm hạ tầng thật (DB, S3, Redis) — phần dây nối
      // giữa các module vẫn là thật, đó mới là thứ cần kiểm tra.
      .overrideProvider(PrismaService)
      .useValue(mockDeep<PrismaClient>())
      .overrideProvider(S3Service)
      .useValue({ getPresignedUrl: jest.fn() })
      .overrideProvider(RedisService)
      .useValue({ getStorePlayback: jest.fn(), setStorePlayback: jest.fn() })
      .compile();

    expect(moduleRef.get(StoresService)).toBeDefined();
    await moduleRef.close();
  });
});
