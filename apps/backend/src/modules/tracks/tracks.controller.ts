import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TracksService } from './tracks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateTrackMetaSchema,
  PaginationSchema,
  JwtPayload,
} from '@cafe-music/shared';

@Controller('tracks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TracksController {
  constructor(private tracksService: TracksService) {}

  @Post()
  @Roles('ORG_ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Body(new ZodValidationPipe(CreateTrackMetaSchema))
    dto: { title: string; artist?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tracksService.create(dto, file, user);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(PaginationSchema))
    query: { page: number; limit: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tracksService.findAll(user, query.page, query.limit);
  }

  @Get(':id/stream-url')
  getStreamUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tracksService.getStreamUrl(id, user);
  }

  @Delete(':id')
  @Roles('ORG_ADMIN')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tracksService.remove(id, user);
  }
}
