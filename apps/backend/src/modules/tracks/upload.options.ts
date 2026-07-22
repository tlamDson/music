import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIMETYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/flac',
  'audio/ogg',
  'audio/aac',
  // M4A — mimetype khác nhau tùy trình duyệt/OS
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
];

/**
 * Chặn ngay ở tầng multer thay vì để service kiểm tra sau: file vượt ngưỡng
 * hoặc sai loại bị từ chối trước khi nạp trọn vào RAM.
 */
export const AUDIO_UPLOAD_OPTIONS: MulterOptions = {
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      callback(
        new BadRequestException(
          `Invalid file type: ${file.mimetype}. Only audio files are allowed.`,
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
