import { ConfigService } from '@nestjs/config';
import { S3Service } from '../../src/modules/tracks/s3.service';

const s3ClientConstructor = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    constructor(config: unknown) {
      s3ClientConstructor(config);
    }
    send = jest.fn();
  },
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/track'),
}));

describe('S3Service', () => {
  const baseEnv: Record<string, string | undefined> = {
    S3_BUCKET: 'cafe-music',
    S3_REGION: 'auto',
    S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    S3_ACCESS_KEY: 'access-key',
    S3_SECRET_KEY: 'secret-key',
  };

  const buildService = (env: Record<string, string | undefined>) => {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new S3Service(config);
  };

  beforeEach(() => {
    s3ClientConstructor.mockClear();
  });

  it('enables path style when S3_FORCE_PATH_STYLE is "true"', () => {
    buildService({ ...baseEnv, S3_FORCE_PATH_STYLE: 'true' });

    expect(s3ClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: true }),
    );
  });

  it('disables path style when S3_FORCE_PATH_STYLE is "false"', () => {
    buildService({ ...baseEnv, S3_FORCE_PATH_STYLE: 'false' });

    expect(s3ClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: false }),
    );
  });

  it('accepts a real boolean from the validated config', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'S3_FORCE_PATH_STYLE' ? false : baseEnv[key],
      ),
    } as unknown as ConfigService;
    new S3Service(config);

    expect(s3ClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: false }),
    );
  });

  it('defaults path style to true when the variable is absent', () => {
    buildService(baseEnv);

    expect(s3ClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ forcePathStyle: true }),
    );
  });

  it('passes region, endpoint and credentials to the client', () => {
    buildService({ ...baseEnv, S3_FORCE_PATH_STYLE: 'true' });

    expect(s3ClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'auto',
        endpoint: 'https://account.r2.cloudflarestorage.com',
        credentials: {
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
        },
      }),
    );
  });
});
