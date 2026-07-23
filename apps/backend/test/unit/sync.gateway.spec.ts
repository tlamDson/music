import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { Socket } from 'socket.io';
import { SyncGateway } from '../../src/modules/sync/sync.gateway';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('SyncGateway', () => {
  let gateway: SyncGateway;
  let prisma: DeepMockProxy<PrismaClient>;
  let jwtService: { verify: jest.Mock };

  const user = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const buildClient = (overrides: Partial<Socket> = {}) =>
    ({
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      emit: jest.fn(),
      ...overrides,
    }) as unknown as Socket;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    jwtService = { verify: jest.fn().mockReturnValue(user) };

    const config = {
      get: jest.fn((key: string) =>
        key === 'JWT_ACCESS_SECRET' ? 'a'.repeat(32) : undefined,
      ),
    } as unknown as ConfigService;

    gateway = new SyncGateway(
      jwtService as unknown as JwtService,
      config,
      prisma as unknown as PrismaService,
    );

    jest
      .spyOn(gateway['logger'], 'warn')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('handleConnection', () => {
    it('stores the verified user on the socket', () => {
      const client = buildClient();

      gateway.handleConnection(client);

      expect((client.data as { user?: unknown }).user).toEqual(user);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a client with no token', () => {
      const client = buildClient({
        handshake: { auth: {}, headers: {} },
      } as unknown as Partial<Socket>);

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects a client with an invalid token', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });
      const client = buildClient();

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('logs a warning when auth fails instead of silently swallowing it', () => {
      const warnSpy = jest.spyOn(gateway['logger'], 'warn');
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      gateway.handleConnection(buildClient());

      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('handleJoinGroup', () => {
    it('joins the room when the group belongs to the user organization', async () => {
      prisma.syncGroup.findFirst.mockResolvedValue({
        id: 'group-1',
        organizationId: 'org-1',
      } as never);
      const client = buildClient();
      client.data = { user };

      const result = await gateway.handleJoinGroup(client, {
        groupId: 'group-1',
      });

      expect(client.join).toHaveBeenCalledWith('sync-group:group-1');
      expect(result).toEqual({
        event: 'joined',
        data: { groupId: 'group-1' },
      });
    });

    it('scopes the lookup to the user organization', async () => {
      prisma.syncGroup.findFirst.mockResolvedValue({
        id: 'group-1',
        organizationId: 'org-1',
      } as never);
      const client = buildClient();
      client.data = { user };

      await gateway.handleJoinGroup(client, { groupId: 'group-1' });

      expect(prisma.syncGroup.findFirst).toHaveBeenCalledWith({
        where: { id: 'group-1', organizationId: 'org-1' },
      });
    });

    it('refuses to join a group from another organization', async () => {
      prisma.syncGroup.findFirst.mockResolvedValue(null);
      const client = buildClient();
      client.data = { user };

      const result = await gateway.handleJoinGroup(client, {
        groupId: 'group-of-other-org',
      });

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        event: 'error',
        data: { message: 'Sync group not found' },
      });
    });

    it('refuses to join when the socket carries no authenticated user', async () => {
      const client = buildClient();
      client.data = {};

      const result = await gateway.handleJoinGroup(client, {
        groupId: 'group-1',
      });

      expect(client.join).not.toHaveBeenCalled();
      expect(prisma.syncGroup.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual({
        event: 'error',
        data: { message: 'Unauthorized' },
      });
    });
  });

  // Nhạc riêng của một quán không thể đi qua room của sync group — cần kênh
  // riêng cho từng store.
  describe('handleJoinStore', () => {
    const storeAdmin = {
      sub: 'user-2',
      email: 'store1@cafe.com',
      role: 'STORE_ADMIN' as const,
      organizationId: 'org-1',
      storeId: 'store-1',
    };

    it('joins the store room for the org admin of that organization', async () => {
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        organizationId: 'org-1',
      } as never);
      const client = buildClient();
      client.data = { user };

      const result = await gateway.handleJoinStore(client, {
        storeId: 'store-1',
      });

      expect(client.join).toHaveBeenCalledWith('store:store-1');
      expect(result).toEqual({ event: 'joined', data: { storeId: 'store-1' } });
    });

    it('joins the store room for the admin of that store', async () => {
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        organizationId: 'org-1',
      } as never);
      const client = buildClient();
      client.data = { user: storeAdmin };

      await gateway.handleJoinStore(client, { storeId: 'store-1' });

      expect(client.join).toHaveBeenCalledWith('store:store-1');
    });

    it('refuses a store admin listening to another store', async () => {
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-2',
        organizationId: 'org-1',
      } as never);
      const client = buildClient();
      client.data = { user: storeAdmin };

      const result = await gateway.handleJoinStore(client, {
        storeId: 'store-2',
      });

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        event: 'error',
        data: { message: 'Store not found' },
      });
    });

    it('refuses a store from another organization', async () => {
      prisma.store.findFirst.mockResolvedValue(null);
      const client = buildClient();
      client.data = { user };

      const result = await gateway.handleJoinStore(client, {
        storeId: 'store-9',
      });

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        event: 'error',
        data: { message: 'Store not found' },
      });
    });
  });

  describe('broadcastToStore', () => {
    it('emits into the room of that store only', () => {
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as never;

      gateway.broadcastToStore('store-1', 'store-now-playing', { a: 1 });

      expect(gateway.server.to).toHaveBeenCalledWith('store:store-1');
      expect(emit).toHaveBeenCalledWith('store-now-playing', { a: 1 });
    });
  });

  describe('handleLeaveGroup', () => {
    it('leaves the requested room', () => {
      const client = buildClient();

      const result = gateway.handleLeaveGroup(client, { groupId: 'group-1' });

      expect(client.leave).toHaveBeenCalledWith('sync-group:group-1');
      expect(result).toEqual({ event: 'left', data: { groupId: 'group-1' } });
    });
  });

  describe('handleLeaveStore', () => {
    it('leaves the store room', () => {
      const client = buildClient();

      const result = gateway.handleLeaveStore(client, { storeId: 'store-1' });

      expect(client.leave).toHaveBeenCalledWith('store:store-1');
      expect(result).toEqual({ event: 'left', data: { storeId: 'store-1' } });
    });
  });
});
