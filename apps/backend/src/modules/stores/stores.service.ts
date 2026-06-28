import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload, CreateStoreDto, UpdateStoreDto } from '@cafe-music/shared';

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: JwtPayload) {
    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId! },
      include: { storeOverride: true },
      orderBy: { name: 'asc' },
    });

    return { data: stores };
  }

  async findOne(id: string, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: user.organizationId! },
      include: { storeOverride: true, syncGroup: true },
    });

    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async create(dto: CreateStoreDto, user: JwtPayload) {
    return this.prisma.store.create({
      data: {
        name: dto.name,
        organizationId: user.organizationId!,
        syncGroupId: dto.syncGroupId ?? null,
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

  async assignGroup(storeId: string, syncGroupId: string, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId! },
    });
    if (!store) throw new NotFoundException('Store not found');

    const group = await this.prisma.syncGroup.findFirst({
      where: { id: syncGroupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    return this.prisma.store.update({
      where: { id: storeId },
      data: { syncGroupId },
    });
  }

  async getStatus(storeId: string, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId! },
      include: { storeOverride: true, syncGroup: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    return {
      storeId: store.id,
      name: store.name,
      syncGroupId: store.syncGroupId,
      syncGroup: store.syncGroup,
      override: store.storeOverride,
    };
  }
}
