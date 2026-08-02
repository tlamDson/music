'use client';

import Link from 'next/link';
import CoverArt from '../media/CoverArt';
import { formatTotalDuration } from '../../lib/format';

export interface BrowsePlaylist {
  id: string;
  name: string;
  scope: 'ORG' | 'STORE';
  storeId?: string | null;
  _count?: { playlistTracks: number };
  totalDurationMs?: number;
}

interface PlaylistCardProps {
  playlist: BrowsePlaylist;
  href: string;
  isPlaying?: boolean;
  onPlay: () => void;
  onDelete?: () => void;
  /** Thứ tự trong danh sách — chỉ 8 card đầu được stagger lúc vào, xem globals.css `.animate-stagger-item`. */
  index?: number;
  /** Độ rộng card — mặc định `w-44 flex-shrink-0` cho rail ngang, trang dùng
   * grid truyền `w-full` để card giãn theo cột thay vì giữ bề ngang cố định. */
  className?: string;
}

export default function PlaylistCard({
  playlist,
  href,
  isPlaying,
  onPlay,
  onDelete,
  index,
  className = 'w-44 flex-shrink-0',
}: PlaylistCardProps) {
  const trackCount = playlist._count?.playlistTracks ?? 0;
  const staggered = typeof index === 'number' && index < 8;

  return (
    <div
      className={`group relative ${className} p-3 rounded-xl shadow-[var(--shadow-md)] transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] ${
        staggered ? 'animate-stagger-item' : ''
      }`}
      style={{
        backgroundColor: 'var(--color-muted)',
        border: '1px solid var(--color-border)',
        ...(staggered ? ({ '--i': index } as React.CSSProperties) : {}),
      }}
    >
      <div className="relative">
        <CoverArt seed={playlist.id} label={playlist.name} size={152} className="w-full" />

        {/* Nút phát tròn xanh, trượt lên từ dưới khi hover hoặc khi bàn phím focus vào nó */}
        <button
          onClick={onPlay}
          className="absolute bottom-2 right-2 w-10 h-10 translate-y-2 rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 transition-[opacity,transform,filter] duration-[var(--duration-base)] hover:brightness-110 focus-visible:outline-none"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
          aria-label={`Phát ${playlist.name}`}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
            </svg>
          )}
        </button>
      </div>

      <Link
        href={href}
        className="block mt-3 text-sm font-medium truncate cursor-pointer transition-colors duration-[var(--duration-fast)] hover:underline focus-visible:outline-none"
        style={{ color: 'var(--color-foreground)' }}
      >
        {playlist.name}
      </Link>

      <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-foreground-50)' }}>
        {trackCount} bài · {formatTotalDuration(playlist.totalDurationMs)}
      </p>

      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 p-1.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[opacity,filter] duration-[var(--duration-base)] hover:brightness-110 focus-visible:outline-none"
          style={{ backgroundColor: 'rgba(15,15,35,0.75)', color: 'var(--color-destructive)' }}
          aria-label={`Xóa ${playlist.name}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
