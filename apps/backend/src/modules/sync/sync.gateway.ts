import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@cafe-music/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveWsCorsOrigin } from './ws-cors-origin';

@WebSocketGateway({
  cors: { origin: resolveWsCorsOrigin(process.env) },
  namespace: '/sync',
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(SyncGateway.name);

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth['token'] as string) ||
        (client.handshake.headers['authorization'] as string)?.replace(
          'Bearer ',
          '',
        );

      if (!token) {
        this.logger.warn(`Rejected socket ${client.id}: missing auth token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });

      const data = client.data as { user?: JwtPayload };
      data.user = payload;
    } catch (error) {
      // Nuốt lỗi ở đây khiến mọi lỗi auth WS trở nên không thể debug trên prod.
      this.logger.warn(
        `Rejected socket ${client.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    // cleanup if needed
  }

  /**
   * Kênh phát của một quán — kênh duy nhất còn lại sau khi bỏ tầng sync group.
   * Xác thực ở `handleConnection` mới chỉ chứng minh "là user hợp lệ", chưa nói
   * gì về quyền với quán này: thiếu check dưới đây thì bất kỳ ai đăng nhập được
   * cũng nghe lén được nhạc của tổ chức khác.
   */
  @SubscribeMessage('join-store')
  async handleJoinStore(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string },
  ) {
    const user = (client.data as { user?: JwtPayload }).user;
    if (!user?.organizationId) {
      return { event: 'error', data: { message: 'Unauthorized' } };
    }

    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, organizationId: user.organizationId },
    });

    if (
      !store ||
      (user.role === 'STORE_ADMIN' && user.storeId !== data.storeId)
    ) {
      this.logger.warn(
        `User ${user.sub} denied join for store ${data.storeId}`,
      );
      return { event: 'error', data: { message: 'Store not found' } };
    }

    void client.join(`store:${data.storeId}`);
    return { event: 'joined', data: { storeId: data.storeId } };
  }

  @SubscribeMessage('leave-store')
  handleLeaveStore(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string },
  ) {
    void client.leave(`store:${data.storeId}`);
    return { event: 'left', data: { storeId: data.storeId } };
  }

  broadcastToStore(storeId: string, event: string, payload: unknown) {
    this.server.to(`store:${storeId}`).emit(event, payload);
  }

  /**
   * Số client đang nghe kênh của quán — mỗi màn hình `/player/[storeId]` và mỗi
   * tab console đang mở là một client. Đọc thẳng từ adapter (đồng bộ, không cần
   * `await fetchSockets()`) để `overview` không phải chờ từng quán một.
   *
   * Phải ép kiểu: gateway có `namespace: '/sync'` nên Nest gán Namespace vào
   * `@WebSocketServer()` dù kiểu khai báo là `Server`, mà trên `Server` thì
   * `adapter` lại là overload setter chứ không phải property đọc được.
   */
  countStoreClients(storeId: string): number {
    const ns = this.server as unknown as {
      adapter?: { rooms?: Map<string, Set<string>> };
    };
    return ns?.adapter?.rooms?.get(`store:${storeId}`)?.size ?? 0;
  }

  @SubscribeMessage('clock-sync')
  handleClockSync(@MessageBody() data: { clientTs: number }) {
    return {
      event: 'clock-sync',
      data: { clientTs: data.clientTs, serverTs: Date.now() },
    };
  }
}
