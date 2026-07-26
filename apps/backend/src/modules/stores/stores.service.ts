import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload, CreateStoreDto, UpdateStoreDto } from '@cafe-music/shared';
import { SyncService } from '../sync/sync.service';
import { SyncGateway } from '../sync/sync.gateway';

@Injectable()
export class StoresService {
  constructor(
    private prisma: PrismaService,
    private syncService: SyncService,
    private gateway: SyncGateway,
  ) {}

  async findAll(user: JwtPayload) {
    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { name: 'asc' },
    });

    return { data: stores };
  }

  /**
   * Chi tiết một quán cho trang `/dashboard/stores/[id]` — nơi admin thực sự
   * bấm phát. Kèm luôn "đang phát gì" và số màn hình đang kết nối để admin biết
   * nhạc có ai nghe không, thay vì phải đoán.
   */
  async findOne(id: string, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: user.organizationId! },
    });
    if (!store) throw new NotFoundException('Store not found');

    return {
      ...store,
      nowPlaying: await this.syncService.nowPlayingForStore(id, user),
      connectedScreens: this.gateway.countStoreClients(id),
    };
  }

  async create(dto: CreateStoreDto, user: JwtPayload) {
    return this.prisma.store.create({
      data: {
        name: dto.name,
        organizationId: user.organizationId!,
      },
    });
  }

  async update(id: string, dto: UpdateStoreDto, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: user.organizationId! },
    });
    if (!store) throw new NotFoundException('Store not found');

    return this.prisma.store.update({ where: { id }, data: dto });
  }

  async getStatus(storeId: string, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId! },
    });
    if (!store) throw new NotFoundException('Store not found');

    return {
      storeId: store.id,
      name: store.name,
      status: store.status,
      currentTrackId: store.currentTrackId,
      connectedScreens: this.gateway.countStoreClients(storeId),
    };
  }
}
