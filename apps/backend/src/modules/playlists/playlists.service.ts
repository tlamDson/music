import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  JwtPayload,
  CreatePlaylistDto,
  UpdatePlaylistDto,
  PaginationDto,
} from '@cafe-music/shared';

@Injectable()
export class PlaylistsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePlaylistDto, user: JwtPayload) {
    if (dto.scope === 'ORG' && user.role !== 'ORG_ADMIN') {
      throw new ForbiddenException(
        'Only ORG_ADMIN can create org-scoped playlists',
      );
    }
    if (dto.scope === 'STORE') {
      if (
        user.role === 'STORE_ADMIN' &&
        dto.storeId &&
        dto.storeId !== user.storeId
      ) {
        throw new ForbiddenException(
          'STORE_ADMIN can only create playlists for their own store',
        );
      }
    }

    return this.prisma.playlist.create({
      data: {
        name: dto.name,
        scope: dto.scope,
        folderId: dto.folderId ?? null,
        organizationId: user.organizationId!,
        storeId: dto.storeId ?? (dto.scope === 'STORE' ? user.storeId : null),
      },
    });
  }

  async findAll(user: JwtPayload, pagination: PaginationDto) {
    const where =
      user.role === 'STORE_ADMIN'
        ? {
            organizationId: user.organizationId!,
            OR: [{ scope: 'ORG' as const }, { storeId: user.storeId }],
          }
        : { organizationId: user.organizationId! };

    const [data, total] = await Promise.all([
      this.prisma.playlist.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: { _count: { select: { playlistTracks: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.playlist.count({ where }),
    ]);

    return { data, meta: { ...pagination, total } };
  }

  async findOne(id: string, user: JwtPayload) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, organizationId: user.organizationId! },
      include: {
        playlistTracks: {
          orderBy: { position: 'asc' },
          include: { track: true },
        },
      },
    });

    if (!playlist) throw new NotFoundException('Playlist not found');
    return playlist;
  }

  async update(id: string, dto: UpdatePlaylistDto, user: JwtPayload) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, organizationId: user.organizationId! },
    });

    if (!playlist) throw new NotFoundException('Playlist not found');

    if (playlist.scope === 'ORG' && user.role !== 'ORG_ADMIN') {
      throw new ForbiddenException(
        'Only ORG_ADMIN can update org-scoped playlists',
      );
    }

    return this.prisma.playlist.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: JwtPayload) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id, organizationId: user.organizationId! },
    });

    if (!playlist) throw new NotFoundException('Playlist not found');

    if (playlist.scope === 'ORG' && user.role !== 'ORG_ADMIN') {
      throw new ForbiddenException(
        'Only ORG_ADMIN can delete org-scoped playlists',
      );
    }

    await this.prisma.playlist.delete({ where: { id } });
    return { message: 'Playlist deleted' };
  }

  async addTrack(playlistId: string, trackId: string, user: JwtPayload) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId: user.organizationId! },
    });

    if (!playlist) throw new NotFoundException('Playlist not found');

    // Track riêng của quán khác không được kéo vào playlist — nếu không thì
    // scope kho nhạc ở TracksService bị vòng qua bằng đúng một request.
    const track = await this.prisma.track.findFirst({
      where:
        user.role === 'STORE_ADMIN'
          ? {
              id: trackId,
              organizationId: user.organizationId!,
              OR: [{ storeId: null }, { storeId: user.storeId }],
            }
          : { id: trackId, organizationId: user.organizationId! },
    });

    if (!track) throw new NotFoundException('Track not found');

    const count = await this.prisma.playlistTrack.count({
      where: { playlistId },
    });

    return this.prisma.playlistTrack.create({
      data: { playlistId, trackId, position: count },
    });
  }

  async reorderTracks(
    playlistId: string,
    orderedTrackIds: string[],
    user: JwtPayload,
  ) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId: user.organizationId! },
    });

    if (!playlist) throw new NotFoundException('Playlist not found');

    await this.prisma.$transaction(
      orderedTrackIds.map((trackId, position) =>
        this.prisma.playlistTrack.updateMany({
          where: { playlistId, trackId },
          data: { position },
        }),
      ),
    );

    return this.findOne(playlistId, user);
  }

  async removeTrack(playlistId: string, trackId: string, user: JwtPayload) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { id: playlistId, organizationId: user.organizationId! },
    });

    if (!playlist) throw new NotFoundException('Playlist not found');

    await this.prisma.playlistTrack.deleteMany({
      where: { playlistId, trackId },
    });
    return { message: 'Track removed from playlist' };
  }
}
