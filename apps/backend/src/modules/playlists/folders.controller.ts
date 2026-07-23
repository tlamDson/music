import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { FoldersService } from './folders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtPayload } from '@cafe-music/shared';
import { z } from 'zod';

const CreateFolderSchema = z.object({ name: z.string().min(1).max(100) });

/**
 * Controller riêng thay vì gắn vào PlaylistsController: khi ở chung,
 * `@Get(':id')` khai báo trước nuốt luôn `/playlists/folders` nên endpoint
 * list folder không bao giờ chạy. Prefix riêng thì thứ tự khai báo không còn
 * ảnh hưởng gì nữa.
 */
@Controller('folders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.foldersService.findAll(user);
  }

  @Post()
  @Roles('ORG_ADMIN')
  create(
    @Body(new ZodValidationPipe(CreateFolderSchema)) body: { name: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.foldersService.create(body.name, user);
  }

  @Delete(':id')
  @Roles('ORG_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.foldersService.remove(id, user);
  }
}
