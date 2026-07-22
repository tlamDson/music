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

  @SubscribeMessage('join-group')
  async handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    // Xác thực ở handleConnection mới chỉ chứng minh "là user hợp lệ" — chưa nói
    // gì về quyền với group này, nếu không check thì bất kỳ ai đăng nhập được
    // cũng nghe lén được sync group của tổ chức khác.
    const user = (client.data as { user?: JwtPayload }).user;
    if (!user?.organizationId) {
      return { event: 'error', data: { message: 'Unauthorized' } };
    }

    const group = await this.prisma.syncGroup.findFirst({
      where: { id: data.groupId, organizationId: user.organizationId },
    });
    if (!group) {
      this.logger.warn(
        `User ${user.sub} denied join for sync group ${data.groupId}`,
      );
      return { event: 'error', data: { message: 'Sync group not found' } };
    }

    void client.join(`sync-group:${data.groupId}`);
    return { event: 'joined', data: { groupId: data.groupId } };
  }

  @SubscribeMessage('leave-group')
  handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    void client.leave(`sync-group:${data.groupId}`);
    return { event: 'left', data: { groupId: data.groupId } };
  }

  broadcastToGroup(groupId: string, event: string, payload: unknown) {
    this.server.to(`sync-group:${groupId}`).emit(event, payload);
  }

  @SubscribeMessage('clock-sync')
  handleClockSync(@MessageBody() data: { clientTs: number }) {
    return {
      event: 'clock-sync',
      data: { clientTs: data.clientTs, serverTs: Date.now() },
    };
  }
}
