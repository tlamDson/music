import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/sync',
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth['token'] as string) ||
        (client.handshake.headers['authorization'] as string)?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });

      client.data['user'] = payload;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    // cleanup if needed
  }

  @SubscribeMessage('join-group')
  handleJoinGroup(@ConnectedSocket() client: Socket, @MessageBody() data: { groupId: string }) {
    void client.join(`sync-group:${data.groupId}`);
    return { event: 'joined', data: { groupId: data.groupId } };
  }

  @SubscribeMessage('leave-group')
  handleLeaveGroup(@ConnectedSocket() client: Socket, @MessageBody() data: { groupId: string }) {
    void client.leave(`sync-group:${data.groupId}`);
    return { event: 'left', data: { groupId: data.groupId } };
  }

  broadcastToGroup(groupId: string, event: string, payload: unknown) {
    this.server.to(`sync-group:${groupId}`).emit(event, payload);
  }

  @SubscribeMessage('clock-sync')
  handleClockSync(@MessageBody() data: { clientTs: number }) {
    return { event: 'clock-sync', data: { clientTs: data.clientTs, serverTs: Date.now() } };
  }
}
