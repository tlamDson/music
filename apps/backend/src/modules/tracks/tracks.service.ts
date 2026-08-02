import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import {
  JwtPayload,
  CreateTrackMetaDto,
  UpdateTrackMetaDto,
} from '@cafe-music/shared';
import { MAX_FILE_SIZE, ALLOWED_MIMETYPES } from './upload.options';

// Multer đã chặn sẵn theo cùng bộ hằng số này (upload.options.ts); service vẫn
// kiểm tra lại để bảo vệ khi được gọi ngoài luồng HTTP upload.

@Injectable()
export class TracksService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  /**
   * Track có `storeId = null` là kho chung của chuỗi, ai trong org cũng dùng
   * được; track có storeId là nhạc riêng của quán đó. Store admin chỉ thấy hai
   * nhóm này, không thấy nhạc riêng của quán khác.
   */
  private scopeFor(user: JwtPayload) {
    return user.role === 'STORE_ADMIN'
      ? {
          organizationId: user.organizationId!,
          OR: [{ storeId: null }, { storeId: user.storeId }],
        }
      : { organizationId: user.organizationId! };
  }

  async create(
    dto: CreateTrackMetaDto,
    file: Express.Multer.File,
    user: JwtPayload,
  ) {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Only audio files are allowed.`,
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      );
    }

    const key = `${user.organizationId}/tracks/${randomUUID()}-${file.originalname.replace(/\s+/g, '_')}`;
    await this.s3.uploadFile({
      organizationId: user.organizationId!,
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    return this.prisma.track.create({
      data: {
        title: dto.title,
        artist: dto.artist ?? null,
        durationMs: dto.durationMs ?? 0,
        source: 'SELF_HOSTED',
        s3Key: key,
        organizationId: user.organizationId!,
        storeId: user.role === 'STORE_ADMIN' ? user.storeId : null,
      },
    });
  }

  async getStreamUrl(trackId: string, user: JwtPayload) {
    const track = await this.prisma.track.findFirst({
      where: { id: trackId, ...this.scopeFor(user) },
    });

    if (!track) throw new NotFoundException('Track not found');
    if (!track.s3Key) throw new NotFoundException('Track file not found');

    const url = await this.s3.getPresignedUrl(track.s3Key);
    return { url, expiresIn: 3600 };
  }

  async findAll(user: JwtPayload, page = 1, limit = 20) {
    const where = this.scopeFor(user);

    const [data, total] = await Promise.all([
      this.prisma.track.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.track.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  async update(trackId: string, dto: UpdateTrackMetaDto, user: JwtPayload) {
    const track = await this.prisma.track.findFirst({
      where: { id: trackId, ...this.scopeFor(user) },
    });

    if (!track) throw new NotFoundException('Track not found');

    // Store admin thấy được track chung của chuỗi nhưng không được sửa nó —
    // đổi tên track chung là đổi cho cả chuỗi (cùng luật với remove()).
    if (user.role === 'STORE_ADMIN' && track.storeId !== user.storeId) {
      throw new ForbiddenException(
        'Store admins can only update tracks of their own store',
      );
    }

    const data: { title?: string; artist?: string | null } = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.artist !== undefined)
      data.artist = dto.artist === '' ? null : dto.artist;

    return this.prisma.track.update({ where: { id: trackId }, data });
  }

  async remove(trackId: string, user: JwtPayload) {
    const track = await this.prisma.track.findFirst({
      where: { id: trackId, ...this.scopeFor(user) },
    });

    if (!track) throw new NotFoundException('Track not found');

    // Store admin thấy được track chung của chuỗi nhưng không được xoá nó —
    // xoá là mất nhạc của mọi quán.
    if (user.role === 'STORE_ADMIN' && track.storeId !== user.storeId) {
      throw new ForbiddenException(
        'Store admins can only delete tracks of their own store',
      );
    }

    if (track.s3Key) {
      await this.s3.deleteFile(track.s3Key);
    }

    await this.prisma.track.delete({ where: { id: trackId } });
    return { message: 'Track deleted' };
  }
}
