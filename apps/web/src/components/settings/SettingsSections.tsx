'use client';

import ProfileSection from './ProfileSection';
import PasswordSection from './PasswordSection';

/**
 * Khung trang Cài đặt dùng chung cho `/dashboard/settings` và
 * `/store/settings` — mọi vai trò đăng nhập đều gọi được `/me`, nên không cần
 * tham số vai trò. PR sau cắm thêm mục Giao diện (PR #11) và Ngôn ngữ (PR #12)
 * vào đây, không sửa hai trang gọi component này.
 */
export default function SettingsSections() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Cài đặt
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Thông tin tài khoản và mật khẩu đăng nhập
        </p>
      </div>

      <ProfileSection />
      <PasswordSection />
    </div>
  );
}
