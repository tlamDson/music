import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

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
    delete process.env.NODE_ENV_OVERRIDE;
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
