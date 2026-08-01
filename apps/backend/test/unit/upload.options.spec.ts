import { BadRequestException } from '@nestjs/common';
import {
  AUDIO_UPLOAD_OPTIONS,
  MAX_FILE_SIZE,
  ALLOWED_MIMETYPES,
} from '../../src/modules/tracks/upload.options';

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

describe('AUDIO_UPLOAD_OPTIONS', () => {
  const runFilter = (mimetype: string) => {
    const cb = jest.fn() as jest.MockedFunction<FileFilterCallback>;
    const fileFilter = AUDIO_UPLOAD_OPTIONS.fileFilter as unknown as (
      req: unknown,
      file: { mimetype: string },
      callback: FileFilterCallback,
    ) => void;
    fileFilter({}, { mimetype }, cb);
    return cb;
  };

  it('caps upload size at 50MB so multer aborts before buffering more', () => {
    expect(AUDIO_UPLOAD_OPTIONS.limits?.fileSize).toBe(MAX_FILE_SIZE);
    expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
  });

  it('only allows a single file per request', () => {
    expect(AUDIO_UPLOAD_OPTIONS.limits?.files).toBe(1);
  });

  it('accepts every allowed audio mimetype', () => {
    for (const mimetype of ALLOWED_MIMETYPES) {
      const cb = runFilter(mimetype);
      expect(cb).toHaveBeenCalledWith(null, true);
    }
  });

  it('rejects a non-audio mimetype', () => {
    const cb = runFilter('text/plain');

    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('rejects an executable disguised with an audio-ish name', () => {
    const cb = runFilter('application/x-msdownload');

    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
  });

  it('names the rejected mimetype in the error message', () => {
    const cb = runFilter('video/mp4');
    const error = cb.mock.calls[0][0] as BadRequestException;

    expect(error.message).toContain('video/mp4');
  });

  it('still includes the m4a mimetype variants', () => {
    expect(ALLOWED_MIMETYPES).toEqual(
      expect.arrayContaining(['audio/mp4', 'audio/x-m4a', 'audio/m4a']),
    );
  });
});
