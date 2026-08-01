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

## Quy ước đã chốt cho UI hiện tại

Layout lấy cảm hứng từ Spotify (sidebar thư viện, hàng card cuộn ngang, bảng track, thanh phát cố định) nhưng **màu/chữ vẫn theo `MASTER.md`** — không bê palette của Spotify vào.

- Bìa nhạc: DB không có ảnh → dùng `components/media/CoverArt.tsx` (sinh từ id, màu lấy trong palette). Không để ô xám trống, cũng không bịa gradient tím/hồng.
- Nút phát/xoá ẩn theo hover phải kèm `focus-visible:opacity-100` để dùng được bằng bàn phím.
- Panel "Đang phát" ẩn dưới breakpoint `xl` để trang không tràn ngang.
- Nhãn và `aria-label` viết tiếng Việt, thống nhất với phần còn lại của app.
- Chưa có bảng `Artist` → **không** dựng card "Giới thiệu nghệ sĩ"/"Người tham gia" như ảnh tham chiếu; panel phải dùng cho trạng thái phát + hàng chờ.
- Modal/dialog dùng chung `components/ui/Dialog.tsx` — overlay + panel đã có sẵn animation enter/exit (180ms, tự tôn trọng `prefers-reduced-motion` qua rule global trong `globals.css`, không cần logic riêng). Đừng tự viết lại overlay/Escape/click-outside ở component mới — bọc nội dung trong `<Dialog open={...} onClose={...} ariaLabel="...">`, và render component cha **không điều kiện** (`open` prop điều khiển mount/unmount nội bộ) nếu muốn animation exit chạy được — xem `AddTrackDialog.tsx` + call site ở `PlaylistDetail.tsx` làm ví dụ.
- **Chỉ `<main>` cuộn.** `components/layout/AppShell.tsx` là `h-[100dvh] flex overflow-hidden`; sidebar `overflow-hidden` (đứng yên tuyệt đối), `<main>` là `overflow-y-auto` — vùng cuộn duy nhất của trang. Trong sidebar chỉ **khối thư viện playlist** được cuộn, và nó phải có `min-h-0` kèm `overflow-y-auto` (thiếu `min-h-0` thì flex item không co lại được, `overflow` vô hiệu và danh sách dài đẩy khối đăng xuất ra ngoài màn hình). Sidebar từng có `overflow-y-auto` trên chính `<nav>` nên sinh thanh cuộn riêng, cuộn mất cả tiêu đề lẫn nút Đăng xuất — đừng làm lại.
- Sidebar vẫn là off-canvas drawer dưới `md` (hamburger + backdrop + Escape để đóng); đừng dùng `w-64` cố định không responsive.
- **Chừa chỗ cho thanh phát bằng `--player-bar-h`**, không bằng padding cứng (`pb-28` từng nhỏ hơn chiều cao thật của thanh phát mobile nên nội dung cuối trang bị cắt).
- **Thang z-index nằm trong `globals.css`** (`--z-player-bar: 50` < `--z-nav-backdrop: 60` < `--z-nav-drawer: 70` < `--z-nav-toggle: 80` < `--z-now-playing: 90` < `--z-dialog: 100`). Dùng `z-[var(--z-*)]`, **không viết số thẳng vào component** — trước đây mỗi file tự chọn `z-30/40/50` nên drawer nav nằm dưới thanh phát và bị nó che mất nút Đăng xuất trên mobile. Thêm lớp nổi mới thì khai báo token trước.
- **Mobile: thanh phát là mini-player một hàng** (bìa + tên bài + bài trước/play/bài sau + nút mở toàn màn hình). Thanh kéo seek, mốc thời gian, cụm âm lượng, shuffle/repeat đều `hidden md:*` — ngón tay không kéo nổi thanh 4px, và âm lượng loa quán không do tab này quyết định. Tiến trình trên mobile là một vạch mảnh `aria-hidden` ở mép trên (thanh `role="progressbar"` thật vẫn ở trong DOM, nên toàn app luôn có **đúng một** progressbar).
- **Ẩn theo breakpoint thì dùng class responsive, đừng render có điều kiện** — giữ phần tử trong DOM để test và người dùng bàn phím không mất nó. Kèm theo: component nhận `className` để ẩn thì base class **không được** chứa `display` cứng (`hidden` không thắng được `flex` viết sẵn) — xem `VolumeControl` nhận `className = 'flex'` làm mặc định.
- **Bảng track dùng chung `components/track/TrackTable.tsx` (+ `TrackRow.tsx`)** — `PlaylistDetail` và `TrackLibrary` đều dùng component này (PR #5, xoá bỏ hai bảng copy-paste gần giống hệt nhau trước đó). Trang mới cần hiển thị danh sách track (vd danh sách bài ở console quán) thì **dùng lại `TrackTable`**, đừng viết bảng track thứ ba — cấu hình qua props (`showAddedAt`, `draggable`/`onReorder`, `onRemove`/`canRemove`, `extraColumns` cho cột riêng của trang như "Phạm vi"). Số thứ tự tự đổi thành nút phát khi hover/focus, hàng đang phát tự hiện icon sóng nhạc + tô accent — không cần tự dựng lại logic này.
- **Ngoại lệ có chủ đích:** `components/player/NowPlayingOverlay.tsx` (màn "Đang phát" toàn màn hình) **không** dùng `Dialog.tsx` — nó gắn với Fullscreen API thật của trình duyệt (`requestFullscreen()`/`fullscreenchange`), không phải overlay CSS đơn thuần, nên tự quản lý mount/unmount (chỉ mount khi `open`, không cần giữ lại một nhịp để chạy animation exit vì thoát fullscreen là tức thời). Vẫn dùng `.animate-slide-up` có sẵn cho enter, `role="dialog"` + `aria-modal="true"` cho accessibility.
- Tên bài/track quá dài dùng `components/player/MarqueeText.tsx` (marquee khi hover bằng CSS thuần qua `<style jsx>`, không đo chữ bằng JS) thay vì tự viết `truncate` + logic riêng.

## Skeleton loading

Thay chữ "Đang tải..." bằng class `.skeleton` có sẵn trong `globals.css` (PR #56) — khối `<div className="skeleton h-* w-*" />` phỏng theo hình dạng nội dung sắp hiện (vd `h-40 w-full` cho khối bảng, `h-6 w-64` cho tiêu đề), không dùng text thuần.

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

| Skill           | Dùng khi                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `ui-ux-pro-max` | Style, màu, font, UX guideline, chart — nguồn bắt buộc cho mọi UI (xem trên)                   |
| `design`        | Brand identity, design tokens, logo, CIP, banner, icon, social photos, slides — skill tổng hợp |
| `design-system` | Token architecture (primitive→semantic→component), component spec, slide generation            |
| `ui-styling`    | shadcn/ui + Tailwind + canvas — dựng UI component/layout cụ thể                                |
| `brand`         | Brand voice, messaging framework, asset/brand consistency                                      |
| `banner-design` | Banner cho social/ads/web hero/print                                                           |
| `slides`        | HTML presentation với Chart.js, copywriting formula                                            |

Các skill này chỉ nên kích hoạt khi task thực sự liên quan (thiết kế/UI/brand) — không dùng cho backend logic thuần túy.
