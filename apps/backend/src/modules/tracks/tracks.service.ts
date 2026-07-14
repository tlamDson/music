import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import { JwtPayload, CreateTrackMetaDto } from '@cafe-music/shared';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIMETYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/flac',
  'audio/ogg',
  'audio/aac',
  // M4A — mimetype khác nhau tùy trình duyệt/OS
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
];

@Injectable()
export class TracksService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

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
        durationMs: 0,
        source: 'SELF_HOSTED',
        s3Key: key,
        organizationId: user.organizationId!,
      },
    });
  }

  async getStreamUrl(trackId: string, user: JwtPayload) {
    const track = await this.prisma.track.findFirst({
      where: { id: trackId, organizationId: user.organizationId! },
    });

    if (!track) throw new NotFoundException('Track not found');
    if (!track.s3Key) throw new NotFoundException('Track file not found');

    const url = await this.s3.getPresignedUrl(track.s3Key);
    return { url, expiresIn: 3600 };
  }

  async findAll(user: JwtPayload, page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.track.findMany({
        where: { organizationId: user.organizationId! },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.track.count({
        where: { organizationId: user.organizationId! },
      }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  async remove(trackId: string, user: JwtPayload) {
    const track = await this.prisma.track.findFirst({
      where: { id: trackId, organizationId: user.organizationId! },
    });

    if (!track) throw new NotFoundException('Track not found');

    if (track.s3Key) {
      await this.s3.deleteFile(track.s3Key);
    }

    await this.prisma.track.delete({ where: { id: trackId } });
    return { message: 'Track deleted' };
  }
}
