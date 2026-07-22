import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Chuẩn hoá mọi lỗi chưa bắt được thành 500 không lộ chi tiết nội bộ
 * (message driver DB, đường dẫn file, stack trace) ra ngoài response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Lỗi ngoài dự kiến: log đầy đủ ở server, trả message chung chung cho client.
    if (!isHttpException || status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      message: isHttpException
        ? this.extractMessage(exception)
        : 'Internal server error',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private extractMessage(exception: HttpException): unknown {
    const payload = exception.getResponse();
    if (typeof payload === 'string') return payload;
    if (payload && typeof payload === 'object' && 'message' in payload) {
      return payload.message;
    }
    return exception.message;
  }
}
