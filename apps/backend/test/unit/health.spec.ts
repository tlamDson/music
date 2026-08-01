import { HealthIndicatorService } from '@nestjs/terminus';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaHealthIndicator } from '../../src/modules/health/prisma.health';
import { RedisHealthIndicator } from '../../src/modules/health/redis.health';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/modules/sync/redis.service';

describe('PrismaHealthIndicator', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let indicator: PrismaHealthIndicator;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    indicator = new PrismaHealthIndicator(
      prisma as unknown as PrismaService,
      new HealthIndicatorService(),
    );
  });

  it('reports up when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }] as never);

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('up');
  });

  it('actually queries the database rather than assuming', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }] as never);

    await indicator.isHealthy('database');

    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('reports down when the database throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('down');
  });

  it('includes the failure reason when down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = await indicator.isHealthy('database');

    expect(JSON.stringify(result)).toContain('connection refused');
  });

  it('reports down instead of hanging when the query never settles', async () => {
    prisma.$queryRaw.mockReturnValue(new Promise(() => {}) as never);

    const result = await indicator.isHealthy('database', 50);

    expect(result.database.status).toBe('down');
    expect(JSON.stringify(result)).toMatch(/timed out/i);
  });
});

describe('RedisHealthIndicator', () => {
  const buildIndicator = (ping: jest.Mock) =>
    new RedisHealthIndicator(
      { ping } as unknown as RedisService,
      new HealthIndicatorService(),
    );

  it('reports up when redis replies to ping', async () => {
    const indicator = buildIndicator(jest.fn().mockResolvedValue('PONG'));

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('up');
  });

  it('reports down when redis rejects', async () => {
    const indicator = buildIndicator(
      jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('down');
  });

  it('reports down when redis replies with something unexpected', async () => {
    const indicator = buildIndicator(jest.fn().mockResolvedValue('WAT'));

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('down');
  });

  // ioredis xếp hàng command khi mất kết nối nên ping() treo thay vì reject —
  // probe mà treo thì Railway chỉ thấy timeout, không bao giờ thấy 503.
  it('reports down instead of hanging when ping never settles', async () => {
    const indicator = buildIndicator(
      jest.fn().mockReturnValue(new Promise(() => {})),
    );

    const result = await indicator.isHealthy('redis', 50);

    expect(result.redis.status).toBe('down');
  });

  it('mentions the timeout in the failure reason', async () => {
    const indicator = buildIndicator(
      jest.fn().mockReturnValue(new Promise(() => {})),
    );

    const result = await indicator.isHealthy('redis', 50);

    expect(JSON.stringify(result)).toMatch(/timed out/i);
  });

  it('does not time out a ping that answers in time', async () => {
    const indicator = buildIndicator(
      jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 10)),
        ),
    );

    const result = await indicator.isHealthy('redis', 200);

    expect(result.redis.status).toBe('up');
  });
});
