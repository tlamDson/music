import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { FoldersService } from './folders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreatePlaylistSchema,
  UpdatePlaylistSchema,
  PaginationSchema,
  JwtPayload,
} from '@cafe-music/shared';
import { z } from 'zod';

const AddTrackSchema = z.object({ trackId: z.string().uuid() });
const ReorderSchema = z.object({ trackIds: z.array(z.string().uuid()) });
const CreateFolderSchema = z.object({ name: z.string().min(1).max(100) });

@Controller('playlists')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlaylistsController {
  constructor(
    private playlistsService: PlaylistsService,
    private foldersService: FoldersService,
  ) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(CreatePlaylistSchema))
    dto: z.infer<typeof CreatePlaylistSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.create(dto, user);
  }

  @Get()
  findAll(
    @Query(new ZodValidationPipe(PaginationSchema))
    query: { page: number; limit: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePlaylistSchema))
    dto: z.infer<typeof UpdatePlaylistSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.remove(id, user);
  }

  @Post(':id/tracks')
  addTrack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddTrackSchema)) body: { trackId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.addTrack(id, body.trackId, user);
  }

  @Patch(':id/tracks/reorder')
  reorderTracks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ReorderSchema)) body: { trackIds: string[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.reorderTracks(id, body.trackIds, user);
  }

  @Delete(':id/tracks/:trackId')
  removeTrack(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.playlistsService.removeTrack(id, trackId, user);
  }

  // ── Folders ────────────────────────────────────────────────────────────

  @Post('/folders')
  @Roles('ORG_ADMIN')
  createFolder(
    @Body(new ZodValidationPipe(CreateFolderSchema)) body: { name: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.foldersService.create(body.name, user);
  }

  @Get('/folders')
  getFolders(@CurrentUser() user: JwtPayload) {
    return this.foldersService.findAll(user);
  }

  @Delete('/folders/:id')
  @Roles('ORG_ADMIN')
  removeFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.foldersService.remove(id, user);
  }
}
