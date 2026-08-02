'use client';

import CoverArt from '../media/CoverArt';
import { formatAddedAt, formatDuration } from '../../lib/format';
import type { TrackTableExtraColumn, TrackTableRow } from './TrackTable';

interface TrackRowProps {
  row: TrackTableRow;
  index: number;
  isCurrent: boolean;
  showAddedAt: boolean;
  extraColumns: TrackTableExtraColumn[];
  onPlay: (row: TrackTableRow, index: number) => void;
  onRemove?: (row: TrackTableRow, index: number) => void;
  canRemove: (row: TrackTableRow) => boolean;
  onEdit?: (row: TrackTableRow, index: number) => void;
  canEdit: (row: TrackTableRow) => boolean;
  draggable: boolean;
  isDragging: boolean;
  onDragStart: (index: number) => void;
  onDropAt: (index: number) => void;
}

/** Một hàng trong `TrackTable` — # (số thứ tự/nút phát/sóng nhạc), tiêu đề,
 * cột tuỳ chọn theo trang, thời lượng, thao tác. */
export default function TrackRow({
  row,
  index,
  isCurrent,
  showAddedAt,
  extraColumns,
  onPlay,
  onRemove,
  canRemove,
  onEdit,
  canEdit,
  draggable,
  isDragging,
  onDragStart,
  onDropAt,
}: TrackRowProps) {
  const { track } = row;
  const showRemove = Boolean(onRemove) && canRemove(row);
  const showEdit = Boolean(onEdit) && canEdit(row);

  return (
    <tr
      draggable={draggable}
      onDragStart={draggable ? () => onDragStart(index) : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={
        draggable
          ? (e) => {
              e.stopPropagation();
              onDropAt(index);
            }
          : undefined
      }
      className={`group transition-[filter] duration-[var(--duration-fast)] hover:brightness-125 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      } ${index < 8 ? 'animate-stagger-item' : ''}`}
      style={{
        borderBottom: '1px solid var(--color-border)',
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isCurrent ? 'rgba(34,197,94,0.08)' : 'transparent',
        ...(index < 8 ? ({ '--i': index } as React.CSSProperties) : {}),
      }}
    >
      <td className="w-10 px-2 py-3 text-sm md:w-12 md:px-4">
        <div className="relative flex h-4 w-4 items-center justify-center">
          {isCurrent ? (
            <>
              <span
                className="flex h-3.5 items-end gap-[2px] transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0 group-focus-within:opacity-0"
                aria-hidden="true"
              >
                {/* Chiều cao dùng px cố định (không phải %) — cha là flex item
                    không có chiều cao khai báo trực tiếp nên height:% sẽ ra 0. */}
                <span
                  className="w-[3px] animate-pulse rounded-sm"
                  style={{ backgroundColor: 'var(--color-accent)', height: '8px' }}
                />
                <span
                  className="w-[3px] animate-pulse rounded-sm"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    height: '14px',
                    animationDelay: '150ms',
                  }}
                />
                <span
                  className="w-[3px] animate-pulse rounded-sm"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    height: '6px',
                    animationDelay: '300ms',
                  }}
                />
              </span>
              <button
                onClick={() => onPlay(row, index)}
                className="absolute inset-0 flex items-center justify-center rounded opacity-0 transition-[opacity,filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 group-focus-within:opacity-100"
                style={{ color: 'var(--color-accent)' }}
                aria-label={`Tạm dừng ${track.title}`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <span
                className="tabular-nums transition-opacity duration-[var(--duration-fast)] group-hover:opacity-0 group-focus-within:opacity-0"
                style={{ color: 'var(--color-foreground-50)' }}
              >
                {index + 1}
              </span>
              <button
                onClick={() => onPlay(row, index)}
                className="absolute inset-0 flex items-center justify-center rounded opacity-0 transition-[opacity,filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 group-focus-within:opacity-100"
                style={{ color: 'var(--color-accent)' }}
                aria-label={`Phát ${track.title}`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </td>

      <td className="px-2 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <CoverArt seed={track.id} label={track.title} size={40} />
          <div className="min-w-0">
            <p
              className="truncate text-sm font-medium"
              title={track.title}
              style={{ color: isCurrent ? 'var(--color-accent)' : 'var(--color-foreground)' }}
            >
              {track.title}
            </p>
            {track.artist && (
              <p
                className="truncate text-xs"
                title={track.artist}
                style={{ color: 'var(--color-foreground-50)' }}
              >
                {track.artist}
              </p>
            )}
          </div>
        </div>
      </td>

      {extraColumns.map((column) => (
        <td
          key={column.key}
          className={`hidden md:table-cell ${column.cellClassName ?? 'px-4 py-3 text-sm'}`}
          style={{ color: 'var(--color-foreground-50)' }}
        >
          {column.render(row, index)}
        </td>
      ))}

      {showAddedAt && (
        <td
          className="hidden whitespace-nowrap px-4 py-3 text-sm tabular-nums md:table-cell"
          style={{ color: 'var(--color-foreground-50)' }}
        >
          {formatAddedAt(row.addedAt)}
        </td>
      )}

      <td
        className="whitespace-nowrap px-2 py-3 text-sm text-right tabular-nums md:px-4"
        style={{ color: 'var(--color-foreground-50)' }}
      >
        {formatDuration(track.durationMs)}
      </td>

      <td className="px-2 py-3 md:px-4">
        <div className="flex items-center justify-end gap-1">
          {showEdit && (
            <button
              onClick={() => onEdit?.(row, index)}
              className="rounded p-2 opacity-100 transition-[opacity,filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:opacity-100 focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100"
              style={{ color: 'var(--color-foreground)' }}
              aria-label={`Sửa ${track.title}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.5-9.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                />
              </svg>
            </button>
          )}
          {showRemove && (
            <button
              onClick={() => onRemove?.(row, index)}
              className="rounded p-2 opacity-100 transition-[opacity,filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:opacity-100 focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100"
              style={{ color: 'var(--color-destructive)' }}
              aria-label={`Xóa ${track.title}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
