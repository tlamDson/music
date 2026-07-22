import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';

/** Params['pinoHttp'] là union có cả DestinationStream nên không narrow được. */
export type LoggerOptions = Params & { pinoHttp: Options };

/** Probe của Railway gọi vài giây một lần — log hết thì trôi mất log thật. */
const SKIPPED_LOG_PATHS = ['/api/v1/health'];

export function shouldSkipRequestLog(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  return SKIPPED_LOG_PATHS.some(
    (skipped) => path === skipped || path.startsWith(`${skipped}/`),
  );
}

export function buildLoggerOptions(
  env: Record<string, string | undefined>,
): LoggerOptions {
  const isProduction = env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: env.LOG_LEVEL || 'info',
      // Production ghi JSON thô để Railway/log aggregator parse được;
      // dev mới cần bản dễ đọc cho người.
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'HH:MM:ss' },
          },
      // Không bao giờ để credential lọt vào log
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.refreshToken',
      ],
      // Nối các dòng log của cùng một request lại với nhau khi debug
      genReqId: (req: IncomingMessage) =>
        (req.headers['x-request-id'] as string) || randomUUID(),
      autoLogging: {
        ignore: (req: IncomingMessage) => shouldSkipRequestLog(req.url),
      },
      customLogLevel: (
        _req: IncomingMessage,
        res: ServerResponse,
        err?: Error,
      ) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Mặc định pino-http dump toàn bộ header (kể cả CSP dài loằng ngoằng của
      // helmet) trên mọi request — tốn dung lượng log mà không dùng đến.
      serializers: {
        req: (req: IncomingMessage & { id?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
