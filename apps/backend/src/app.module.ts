import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TracksModule } from './modules/tracks/tracks.module';
import { PlaylistsModule } from './modules/playlists/playlists.module';
import { SyncModule } from './modules/sync/sync.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    TracksModule,
    PlaylistsModule,
    SyncModule,
    StoresModule,
    UsersModule,
    SchedulerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
