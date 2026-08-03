import {
  ChangePasswordSchema,
  CreateOrganizationSchema,
  CreatePlaylistSchema,
  CreateStoreSchema,
  CreateTrackMetaSchema,
  LoginSchema,
  PaginationSchema,
  PlaybackModeSchema,
  PlaylistQuerySchema,
  RefreshTokenSchema,
  StorePlaySchema,
  UpdatePlaylistSchema,
  UpdateProfileSchema,
  UpdateStoreSchema,
  UpdateTrackMetaSchema,
} from '../../src/schemas';

/**
 * Zod schema ở package này là tầng chặn input duy nhất của backend
 * (`ZodValidationPipe` gọi `safeParse`, hỏng thì trả 400). Test tập trung vào
 * **case sai** — rỗng, quá dài, sai định dạng, sai kiểu — vì đó mới là thứ
 * schema tồn tại để chặn; happy path chỉ cần một assertion mỗi schema.
 */

/** Lấy danh sách field bị lỗi, để assert đúng field chứ không chỉ "có lỗi". */
function errorFields(result: { success: boolean; error?: unknown }): string[] {
  if (result.success) return [];
  const error = result.error as { issues: { path: (string | number)[] }[] };
  return error.issues.map((issue) => issue.path.join('.'));
}

describe('LoginSchema', () => {
  it('accepts a valid email and an 8-character password', () => {
    const result = LoginSchema.safeParse({
      email: 'admin@cafe.com',
      password: '12345678',
    });

    expect(result.success).toBe(true);
  });

  it.each([['abc'], ['a@'], [''], ['no-at-sign.com'], ['@nolocal.com']])(
    'rejects %p as an email',
    (email) => {
      const result = LoginSchema.safeParse({ email, password: '12345678' });

      expect(result.success).toBe(false);
      expect(errorFields(result)).toContain('email');
    },
  );

  it('rejects a password shorter than 8 characters', () => {
    const result = LoginSchema.safeParse({
      email: 'admin@cafe.com',
      password: '1234567',
    });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('password');
  });

  it('rejects a missing password', () => {
    const result = LoginSchema.safeParse({ email: 'admin@cafe.com' });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('password');
  });

  it('rejects a non-string password instead of coercing it', () => {
    const result = LoginSchema.safeParse({
      email: 'admin@cafe.com',
      password: 12345678,
    });

    expect(result.success).toBe(false);
  });
});

describe('RefreshTokenSchema', () => {
  it('accepts a non-empty token', () => {
    expect(RefreshTokenSchema.safeParse({ refreshToken: 'x' }).success).toBe(true);
  });

  it('rejects an empty token', () => {
    const result = RefreshTokenSchema.safeParse({ refreshToken: '' });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('refreshToken');
  });

  it('rejects a missing token', () => {
    expect(RefreshTokenSchema.safeParse({}).success).toBe(false);
  });
});

describe('CreateOrganizationSchema', () => {
  it('accepts a lowercase slug with digits and hyphens', () => {
    const result = CreateOrganizationSchema.safeParse({
      name: 'Cafe Music Demo',
      slug: 'cafe-music-demo-2',
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['Cafe-Music', 'chữ hoa'],
    ['cafe_music', 'gạch dưới'],
    ['cafe music', 'dấu cách'],
    ['cà-phê', 'tiếng Việt có dấu'],
    ['cafe.music', 'dấu chấm'],
  ])('rejects slug %p (%s)', (slug, _reason) => {
    const result = CreateOrganizationSchema.safeParse({ name: 'Hợp lệ', slug });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('slug');
  });

  it('explains the slug rule in the error message', () => {
    const result = CreateOrganizationSchema.safeParse({
      name: 'Hợp lệ',
      slug: 'KHÔNG HỢP LỆ',
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toContain('Only lowercase letters, numbers and hyphens');
  });

  it('enforces the slug length window (2..50)', () => {
    expect(CreateOrganizationSchema.safeParse({ name: 'Hợp lệ', slug: 'a' }).success).toBe(false);
    expect(
      CreateOrganizationSchema.safeParse({
        name: 'Hợp lệ',
        slug: 'a'.repeat(51),
      }).success,
    ).toBe(false);
    expect(
      CreateOrganizationSchema.safeParse({
        name: 'Hợp lệ',
        slug: 'a'.repeat(50),
      }).success,
    ).toBe(true);
  });

  it('enforces the name length window (2..100)', () => {
    expect(CreateOrganizationSchema.safeParse({ name: 'A', slug: 'ok' }).success).toBe(false);
    expect(CreateOrganizationSchema.safeParse({ name: 'A'.repeat(101), slug: 'ok' }).success).toBe(
      false,
    );
  });
});

describe('CreateStoreSchema / UpdateStoreSchema', () => {
  it('accepts a name of exactly 2 and exactly 100 characters', () => {
    expect(CreateStoreSchema.safeParse({ name: 'Ab' }).success).toBe(true);
    expect(CreateStoreSchema.safeParse({ name: 'A'.repeat(100) }).success).toBe(true);
  });

  it('rejects a name of 1 or 101 characters', () => {
    expect(CreateStoreSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(CreateStoreSchema.safeParse({ name: 'A'.repeat(101) }).success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(CreateStoreSchema.safeParse({}).success).toBe(false);
  });

  // `.partial()` chỉ bỏ tính bắt buộc, KHÔNG nới lỏng luật của field khi có mặt.
  it('accepts an empty patch but still enforces min(2) when name is present', () => {
    expect(UpdateStoreSchema.safeParse({}).success).toBe(true);
    expect(UpdateStoreSchema.safeParse({ name: '' }).success).toBe(false);
    expect(UpdateStoreSchema.safeParse({ name: 'A' }).success).toBe(false);
  });
});

describe('CreatePlaylistSchema / UpdatePlaylistSchema', () => {
  it('accepts a minimal ORG-scoped playlist', () => {
    const result = CreatePlaylistSchema.safeParse({
      name: 'Chill',
      scope: 'ORG',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty name and a 101-character name', () => {
    expect(CreatePlaylistSchema.safeParse({ name: '', scope: 'ORG' }).success).toBe(false);
    expect(CreatePlaylistSchema.safeParse({ name: 'a'.repeat(101), scope: 'ORG' }).success).toBe(
      false,
    );
  });

  it.each([['GLOBAL'], ['org'], ['Store'], ['']])('rejects scope %p', (scope) => {
    const result = CreatePlaylistSchema.safeParse({ name: 'Chill', scope });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('scope');
  });

  it('rejects a missing scope', () => {
    const result = CreatePlaylistSchema.safeParse({ name: 'Chill' });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('scope');
  });

  // optional nhưng vẫn min(1) khi có mặt — chuỗi rỗng không phải "không gửi".
  it('rejects an empty folderId / storeId even though both are optional', () => {
    expect(
      CreatePlaylistSchema.safeParse({
        name: 'Chill',
        scope: 'ORG',
        folderId: '',
      }).success,
    ).toBe(false);
    expect(
      CreatePlaylistSchema.safeParse({
        name: 'Chill',
        scope: 'STORE',
        storeId: '',
      }).success,
    ).toBe(false);
  });

  it('accepts an empty patch but still rejects a bad scope', () => {
    expect(UpdatePlaylistSchema.safeParse({}).success).toBe(true);
    expect(UpdatePlaylistSchema.safeParse({ scope: 'GLOBAL' }).success).toBe(false);
  });
});

describe('CreateTrackMetaSchema', () => {
  it('accepts title only', () => {
    expect(CreateTrackMetaSchema.safeParse({ title: 'Bài hát' }).success).toBe(true);
  });

  // Upload là multipart nên mọi field tới dưới dạng chuỗi → `z.coerce`.
  it('coerces a numeric string durationMs into a number', () => {
    const result = CreateTrackMetaSchema.safeParse({
      title: 'Bài hát',
      durationMs: '5000',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.durationMs).toBe(5000);
    expect(typeof (result.success && result.data.durationMs)).toBe('number');
  });

  it.each([
    [-1, 'âm'],
    [86_400_001, 'quá 24 giờ'],
    [1.5, 'không phải số nguyên'],
    ['abc', 'không parse được thành số'],
  ])('rejects durationMs %p (%s)', (durationMs, _reason) => {
    const result = CreateTrackMetaSchema.safeParse({
      title: 'Bài hát',
      durationMs,
    });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('durationMs');
  });

  it('accepts durationMs at both ends of the allowed range', () => {
    expect(CreateTrackMetaSchema.safeParse({ title: 'x', durationMs: 0 }).success).toBe(true);
    expect(CreateTrackMetaSchema.safeParse({ title: 'x', durationMs: 86_400_000 }).success).toBe(
      true,
    );
  });

  it('rejects an empty title and a 201-character title', () => {
    expect(CreateTrackMetaSchema.safeParse({ title: '' }).success).toBe(false);
    expect(CreateTrackMetaSchema.safeParse({ title: 'a'.repeat(201) }).success).toBe(false);
  });

  it('rejects a 201-character artist', () => {
    const result = CreateTrackMetaSchema.safeParse({
      title: 'Bài hát',
      artist: 'a'.repeat(201),
    });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('artist');
  });
});

describe('UpdateTrackMetaSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateTrackMetaSchema.safeParse({}).success).toBe(true);
  });

  // `artist: null` là ngữ nghĩa "xoá ca sĩ về chưa rõ", khác hẳn "không gửi".
  it('accepts artist: null to clear the artist', () => {
    const result = UpdateTrackMetaSchema.safeParse({ artist: null });

    expect(result.success).toBe(true);
    expect(result.success && result.data.artist).toBeNull();
  });

  it('rejects title: null (title has no clear semantics)', () => {
    const result = UpdateTrackMetaSchema.safeParse({ title: null });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('title');
  });

  it('rejects an empty title', () => {
    expect(UpdateTrackMetaSchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('UpdateProfileSchema', () => {
  it('accepts a name', () => {
    expect(UpdateProfileSchema.safeParse({ name: 'Lam' }).success).toBe(true);
  });

  it('rejects an empty name, a 101-character name and a missing name', () => {
    expect(UpdateProfileSchema.safeParse({ name: '' }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
    expect(UpdateProfileSchema.safeParse({}).success).toBe(false);
  });

  /**
   * Lớp chặn leo thang đặc quyền: schema KHÔNG reject field lạ, nó **strip**
   * chúng (mặc định của Zod). Nên `role`/`isActive`/`storeId` gửi kèm vẫn parse
   * thành công nhưng không sống sót sang `data` — service nhận được đúng `name`.
   * Nếu ai đó đổi sang `.passthrough()` thì test này đỏ.
   */
  it('strips privilege fields instead of letting them through', () => {
    const result = UpdateProfileSchema.safeParse({
      name: 'Lam',
      role: 'ORG_ADMIN',
      isActive: true,
      storeId: 'store-2',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ name: 'Lam' });
  });
});

describe('ChangePasswordSchema', () => {
  it('accepts two passwords of at least 8 characters', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'old-password',
      newPassword: 'new-password',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than 8 characters on either field', () => {
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: '1234567',
        newPassword: 'new-password',
      }).success,
    ).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: '1234567',
      }).success,
    ).toBe(false);
  });

  // bcrypt cắt im lặng sau 72 byte — chặn ở validation thay vì để phần vượt
  // quá bị bỏ qua vô tình.
  it('rejects a newPassword longer than 72 characters but accepts exactly 72', () => {
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'a'.repeat(73),
      }).success,
    ).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'a'.repeat(72),
      }).success,
    ).toBe(true);
  });

  it('does not cap currentPassword at 72 (only the new one is stored)', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'a'.repeat(200),
      newPassword: 'new-password',
    });

    expect(result.success).toBe(true);
  });
});

describe('StorePlaySchema', () => {
  it('defaults trackIndex to 0 when omitted', () => {
    const result = StorePlaySchema.safeParse({ playlistId: 'pl-1' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.trackIndex).toBe(0);
  });

  it('rejects an empty playlistId', () => {
    const result = StorePlaySchema.safeParse({ playlistId: '' });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('playlistId');
  });

  it.each([[-1], [1.5]])('rejects trackIndex %p', (trackIndex) => {
    const result = StorePlaySchema.safeParse({
      playlistId: 'pl-1',
      trackIndex,
    });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('trackIndex');
  });

  /**
   * Khác `CreateTrackMetaSchema.durationMs`: chỗ này là `z.number()` trần chứ
   * không phải `z.coerce.number()`, vì body là JSON (không phải multipart) nên
   * số tới đúng kiểu số. Gửi chuỗi là client sai, phải 400.
   */
  it('does NOT coerce a string trackIndex (body is JSON, not multipart)', () => {
    const result = StorePlaySchema.safeParse({
      playlistId: 'pl-1',
      trackIndex: '2',
    });

    expect(result.success).toBe(false);
  });
});

describe('PlaybackModeSchema', () => {
  // Cả hai field optional có chủ đích: client chỉ đổi repeat không phải gửi kèm
  // shuffle. `.default()` sẽ biến field thành bắt buộc trong type sau `z.infer`.
  it('accepts an empty object', () => {
    const result = PlaybackModeSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({});
  });

  it.each([['OFF'], ['ALL'], ['ONE']])('accepts repeat %p', (repeat) => {
    expect(PlaybackModeSchema.safeParse({ repeat }).success).toBe(true);
  });

  it.each([['off'], ['all'], ['NONE'], ['']])('rejects repeat %p', (repeat) => {
    const result = PlaybackModeSchema.safeParse({ repeat });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('repeat');
  });

  it('rejects a string shuffle instead of coercing it', () => {
    const result = PlaybackModeSchema.safeParse({ shuffle: 'true' });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('shuffle');
  });
});

describe('PaginationSchema', () => {
  it('defaults to page 1 and limit 20', () => {
    const result = PaginationSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ page: 1, limit: 20 });
  });

  // Query string luôn là chuỗi → `z.coerce` là bắt buộc ở đây.
  it('coerces numeric strings from the query string', () => {
    const result = PaginationSchema.safeParse({ page: '2', limit: '50' });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ page: 2, limit: 50 });
  });

  it.each([
    [{ page: 0 }, 'page'],
    [{ page: '0' }, 'page'],
    [{ page: 1.5 }, 'page'],
    [{ page: 'abc' }, 'page'],
    [{ limit: 0 }, 'limit'],
    [{ limit: 101 }, 'limit'],
    [{ limit: '101' }, 'limit'],
  ])('rejects %p', (input, field) => {
    const result = PaginationSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain(field);
  });

  it('accepts limit at the boundary (1 and 100)', () => {
    expect(PaginationSchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(PaginationSchema.safeParse({ limit: 100 }).success).toBe(true);
  });
});

describe('PlaylistQuerySchema', () => {
  it('inherits pagination defaults and defaults sort to recent', () => {
    const result = PlaylistQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      page: 1,
      limit: 20,
      sort: 'recent',
    });
  });

  /**
   * `.trim()` chạy TRƯỚC `.min(1)`, nên chuỗi toàn khoảng trắng bị loại thay vì
   * lọt xuống service thành `name contains '   '` (khớp mọi thứ có dấu cách).
   */
  it('rejects a whitespace-only q because trim runs before min(1)', () => {
    const result = PlaylistQuerySchema.safeParse({ q: '   ' });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('q');
  });

  it('trims q before handing it to the service', () => {
    const result = PlaylistQuerySchema.safeParse({ q: '  chill  ' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.q).toBe('chill');
  });

  it('rejects a q longer than 100 characters', () => {
    expect(PlaylistQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });

  it.each([['created'], ['name-asc'], ['']])('rejects sort %p', (sort) => {
    const result = PlaylistQuerySchema.safeParse({ sort });

    expect(result.success).toBe(false);
    expect(errorFields(result)).toContain('sort');
  });

  it('rejects an invalid scope but accepts ORG and STORE', () => {
    expect(PlaylistQuerySchema.safeParse({ scope: 'ORG' }).success).toBe(true);
    expect(PlaylistQuerySchema.safeParse({ scope: 'STORE' }).success).toBe(true);
    expect(PlaylistQuerySchema.safeParse({ scope: 'GLOBAL' }).success).toBe(false);
  });

  it('still enforces the inherited pagination bounds', () => {
    expect(PlaylistQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(PlaylistQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
