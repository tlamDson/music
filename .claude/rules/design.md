# Frontend Design — bắt buộc dùng design system từ skill `ui-ux-pro-max`

Mọi thay đổi UI ở `apps/web` (tạo mới hoặc sửa) phải tham chiếu design system, không tự bịa màu/font/spacing.

1. Đọc `design-system/cafe-music/MASTER.md` (nguồn sự thật: màu, typography, spacing, component).
2. Nếu đang làm một trang cụ thể, kiểm tra `design-system/cafe-music/pages/<page-name>.md` — rule trong file trang ưu tiên ghi đè MASTER.
3. Nếu chưa có design system hoặc cần style/màu/typography mới, sinh từ skill thay vì tự nghĩ (Windows dùng `python`, không phải `python3`):

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<mô tả sản phẩm/trang>" --design-system --persist -p "Cafe Music"
python .claude/skills/ui-ux-pro-max/scripts/search.py "<truy vấn>" --domain style
python .claude/skills/ui-ux-pro-max/scripts/search.py "<truy vấn>" --stack react
```

## Checklist pre-delivery cho mọi UI

- Không dùng emoji làm icon; dùng SVG (Heroicons/Lucide).
- `cursor-pointer` trên mọi phần tử click được.
- Hover state có transition mượt (150–300ms).
- Tương phản chữ tối thiểu 4.5:1.
- Focus state nhìn thấy được khi điều hướng bàn phím.
- Tôn trọng `prefers-reduced-motion`.
- Responsive tại 375px, 768px, 1024px, 1440px.
- Tránh anti-pattern đã nêu trong design system (vd gradient tím/hồng kiểu AI).

## Skills có sẵn (`.claude/skills/`)

| Skill | Dùng khi |
|---|---|
| `ui-ux-pro-max` | Style, màu, font, UX guideline, chart — nguồn bắt buộc cho mọi UI (xem trên) |
| `design` | Brand identity, design tokens, logo, CIP, banner, icon, social photos, slides — skill tổng hợp |
| `design-system` | Token architecture (primitive→semantic→component), component spec, slide generation |
| `ui-styling` | shadcn/ui + Tailwind + canvas — dựng UI component/layout cụ thể |
| `brand` | Brand voice, messaging framework, asset/brand consistency |
| `banner-design` | Banner cho social/ads/web hero/print |
| `slides` | HTML presentation với Chart.js, copywriting formula |

Các skill này chỉ nên kích hoạt khi task thực sự liên quan (thiết kế/UI/brand) — không dùng cho backend logic thuần túy.
