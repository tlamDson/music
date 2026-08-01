import { Module } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { FoldersService } from './folders.service';
import { PlaylistsController } from './playlists.controller';
import { FoldersController } from './folders.controller';

@Module({
  providers: [PlaylistsService, FoldersService],
  controllers: [PlaylistsController, FoldersController],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
