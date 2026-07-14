import { Module } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { FoldersService } from './folders.service';
import { PlaylistsController } from './playlists.controller';

@Module({
  providers: [PlaylistsService, FoldersService],
  controllers: [PlaylistsController],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
