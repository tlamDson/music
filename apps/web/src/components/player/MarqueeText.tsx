'use client';

/**
 * Tên bài quá dài bị cắt gọn ở trạng thái tĩnh — hover để chạy marquee lộ hết
 * chữ. Cố tình không đo bề rộng chữ bằng JS (ResizeObserver/canvas...): nhân
 * đôi chữ trong track rồi trượt đúng 50% bề rộng track khi hover — vòng lặp
 * mượt bất kể chữ dài ngắn ra sao, không cần biết trước bề rộng thật.
 */
interface MarqueeTextProps {
  text: string;
  className?: string;
}

export default function MarqueeText({ text, className }: MarqueeTextProps) {
  return (
    <div className={`marquee-viewport ${className ?? ''}`}>
      <div className="marquee-track">
        <span className="marquee-item">{text}</span>
        <span className="marquee-item" aria-hidden="true">
          {text}
        </span>
      </div>
      <style jsx>{`
        .marquee-viewport {
          display: block;
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
          min-width: 0;
        }
        .marquee-track {
          display: inline-flex;
          width: max-content;
        }
        .marquee-item {
          padding-right: 2.5rem;
        }
        .marquee-viewport:hover .marquee-track {
          animation: marquee-scroll 6s linear infinite;
        }
        @keyframes marquee-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
