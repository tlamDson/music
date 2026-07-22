import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_PREFIX } from '@cafe-music/shared';
import { installBigIntJsonSupport } from './common/bigint-json';

installBigIntJsonSupport();

async function bootstrap() {
  // bufferLogs: giữ log lúc khởi động lại cho tới khi pino sẵn sàng nhận,
  // nếu không những dòng đầu tiên sẽ ra định dạng khác phần còn lại.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Mọi log của Nest đi qua pino → một định dạng duy nhất, kèm request id
  const logger = app.get(PinoLogger);
  app.useLogger(logger);

  app.use(helmet());

  // Railway/Vercel đứng trước app: không tin proxy thì req.ip là IP của proxy
  // và rate limit sẽ gộp chung mọi client thành một.
  app.set('trust proxy', 1);

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins =
    process.env.NODE_ENV === 'production'
      ? [process.env.WEB_URL || 'http://localhost:3000']
      : true; // allow all origins in development

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  // 0.0.0.0 để container/PaaS route được traffic vào (mặc định chỉ bind localhost).
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend listening on port ${port} (prefix ${API_PREFIX})`);
}

void bootstrap();
