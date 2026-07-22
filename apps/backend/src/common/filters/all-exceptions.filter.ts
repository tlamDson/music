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
      ...this.buildBody(isHttpException ? exception : null),
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Giữ nguyên payload dạng object của HttpException thay vì chỉ lấy `message`:
   * readiness check của Terminus mang theo `info`/`error`/`details` cho biết
   * **dependency nào** đang chết — bóp về một dòng message là mất sạch.
   */
  private buildBody(exception: HttpException | null): Record<string, unknown> {
    if (!exception) return { message: 'Internal server error' };

    const payload = exception.getResponse();
    if (typeof payload === 'string') return { message: payload };
    if (payload && typeof payload === 'object') {
      return { message: exception.message, ...payload };
    }
    return { message: exception.message };
  }
}
