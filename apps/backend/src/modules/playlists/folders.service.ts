import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '@cafe-music/shared';

@Injectable()
export class FoldersService {
  constructor(private prisma: PrismaService) {}

  async create(name: string, user: JwtPayload) {
    return this.prisma.folder.create({
      data: {
        name,
        scope: 'ORG',
        organizationId: user.organizationId!,
      },
    });
  }

  async findAll(user: JwtPayload) {
    return this.prisma.folder.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { name: 'asc' },
    });
  }

  async remove(id: string, user: JwtPayload) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, organizationId: user.organizationId! },
    });

    if (!folder) throw new NotFoundException('Folder not found');
    await this.prisma.folder.delete({ where: { id } });
    return { message: 'Folder deleted' };
  }
}
