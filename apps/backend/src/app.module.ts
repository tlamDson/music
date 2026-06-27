import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    // Modules sẽ được thêm dần khi implement từng feature:
    // PrismaModule, AuthModule, OrganizationsModule, StoresModule,
    // PlaylistsModule, TracksModule, SyncModule
  ],
  controllers: [AppController],
})
export class AppModule {}
