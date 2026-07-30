import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const captureException = Sentry.captureException as jest.Mock;

describe('AllExceptionsFilter', () => {
  type ResponseBody = Record<string, unknown>;

  let filter: AllExceptionsFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  /** Ghi lại body đã trả về, typed sẵn để assert không phải ép kiểu từ `any`. */
  let sentBodies: ResponseBody[];

  let host: ArgumentsHost;

  beforeEach(() => {
    sentBodies = [];
    jsonMock = jest.fn((body: ResponseBody) => {
      sentBodies.push(body);
    });
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({ url: '/api/v1/tracks', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;

    filter = new AllExceptionsFilter();
    // Không để log lỗi làm nhiễu output test
    jest
      .spyOn(filter['logger'], 'error')
      .mockImplementation(() => undefined as never);
    jest
      .spyOn(filter['logger'], 'warn')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    captureException.mockClear();
    delete process.env.NODE_ENV_OVERRIDE;
  });

  /**
   * Quota free tier của Sentry tính theo số event. 401 (sai mật khẩu), 404 và
   * 429 (rate limit) là chuyện bình thường xảy ra hằng ngày — đẩy hết lên thì
   * lỗi thật bị chôn giữa đống nhiễu và hết quota trước cuối tháng.
   */
  describe('Sentry reporting', () => {
    it('reports unexpected errors', () => {
      filter.catch(new Error('database exploded'), host);

      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('reports 5xx HttpExceptions', () => {
      filter.catch(
        new HttpException('upstream down', HttpStatus.BAD_GATEWAY),
        host,
      );

      expect(captureException).toHaveBeenCalledTimes(1);
    });

    it('stays silent on 4xx, which are normal traffic', () => {
      filter.catch(new HttpException('nope', HttpStatus.UNAUTHORIZED), host);
      filter.catch(new HttpException('gone', HttpStatus.NOT_FOUND), host);
      filter.catch(
        new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS),
        host,
      );

      expect(captureException).not.toHaveBeenCalled();
    });
  });

  it('preserves the status code of an HttpException', () => {
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('preserves the message of an HttpException', () => {
    filter.catch(
      new HttpException('Track not found', HttpStatus.NOT_FOUND),
      host,
    );

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Track not found' }),
    );
  });

  it('maps an unknown error to 500', () => {
    filter.catch(new Error('boom'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('does not leak the internal error message on a 500', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    const body = sentBodies[0];
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(body.message).toBe('Internal server error');
  });

  it('never includes a stack trace in the response body', () => {
    filter.catch(new Error('boom'), host);

    const body = sentBodies[0];
    expect(body).not.toHaveProperty('stack');
  });

  it('includes path and timestamp for debugging', () => {
    filter.catch(new Error('boom'), host);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/v1/tracks',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp: expect.any(String) as unknown as string,
      }),
    );
  });

  // Terminus trả kèm info/error/details cho biết dependency nào chết
  it('preserves the structured payload of an HttpException', () => {
    filter.catch(
      new HttpException(
        {
          status: 'error',
          error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      ),
      host,
    );

    const body = sentBodies[0];
    expect(body.error).toEqual({
      redis: { status: 'down', message: 'ECONNREFUSED' },
    });
  });

  it('still reports the right status code alongside a structured payload', () => {
    filter.catch(
      new HttpException({ status: 'error' }, HttpStatus.SERVICE_UNAVAILABLE),
      host,
    );

    expect(sentBodies[0].statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('logs unexpected errors at error level', () => {
    const errorSpy = jest.spyOn(filter['logger'], 'error');

    filter.catch(new Error('boom'), host);

    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not log expected 4xx responses at error level', () => {
    const errorSpy = jest.spyOn(filter['logger'], 'error');

    filter.catch(new HttpException('Nope', HttpStatus.NOT_FOUND), host);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
