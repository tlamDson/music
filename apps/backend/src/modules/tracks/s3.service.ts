import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Config đã validate trả về boolean, nhưng khi đọc env thô vẫn là string —
 * chấp nhận cả hai, mặc định true (MinIO dev / R2).
 */
function resolveForcePathStyle(value: boolean | string | undefined): boolean {
  if (value === undefined || value === '') return true;
  if (typeof value === 'boolean') return value;
  return value.toLowerCase() !== 'false';
}

export interface UploadParams {
  organizationId: string;
  key: string;
  buffer: Buffer;
  contentType: string;
}

@Injectable()
export class S3Service {
  private client: S3Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'cafe-music';
    this.client = new S3Client({
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      endpoint: config.get<string>('S3_ENDPOINT'),
      // MinIO/R2 cần path style, AWS S3 thật thì không — phải theo env.
      forcePathStyle: resolveForcePathStyle(
        config.get<boolean | string>('S3_FORCE_PATH_STYLE'),
      ),
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: config.get<string>('S3_SECRET_KEY') ?? '',
      },
    });
  }

  async uploadFile(params: UploadParams): Promise<{ key: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType,
      }),
    );
    return { key: params.key };
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
