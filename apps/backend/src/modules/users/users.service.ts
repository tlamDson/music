import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '@cafe-music/shared';
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['ORG_ADMIN', 'STORE_ADMIN']),
  storeId: z.string().uuid().optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ORG_ADMIN', 'STORE_ADMIN']).optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: JwtPayload) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId! },
      select: { id: true, email: true, name: true, role: true, storeId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data: users };
  }

  async create(dto: CreateUserDto, user: JwtPayload) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: dto.role,
        organizationId: user.organizationId!,
        storeId: dto.storeId ?? null,
      },
      select: { id: true, email: true, name: true, role: true, storeId: true, createdAt: true },
    });

    return created;
  }

  async update(id: string, dto: UpdateUserDto, user: JwtPayload) {
    const target = await this.prisma.user.findFirst({
      where: { id, organizationId: user.organizationId! },
    });
    if (!target) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        storeId: dto.storeId,
      },
      select: { id: true, email: true, name: true, role: true, storeId: true },
    });
  }
}
