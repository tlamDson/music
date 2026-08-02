'use client';

import { useState, type ReactNode } from 'react';
import { usePlayer } from '../player/PlayerProvider';
import TrackRow from './TrackRow';
import type { Track } from '@cafe-music/shared';

/** Một hàng của bảng — `id` là khoá React, `addedAt` chỉ playlist mới có. */
export interface TrackTableRow {
  id: string;
  track: Track;
  addedAt?: string;
}

/** Cột tuỳ trang chèn giữa "Tiêu đề" và "Thời lượng" — vd "Phạm vi" ở kho
 * nhạc chung. Trang thứ ba cần thêm cột riêng thì dùng cơ chế này, đừng viết
 * bảng track mới. */
export interface TrackTableExtraColumn {
  key: string;
  header: ReactNode;
  render: (row: TrackTableRow, index: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

interface TrackTableProps {
  rows: TrackTableRow[];
  onPlay: (row: TrackTableRow, index: number) => void;
  onRemove?: (row: TrackTableRow, index: number) => void;
  /** Mặc định cho phép xoá mọi hàng khi `onRemove` có mặt. */
  canRemove?: (row: TrackTableRow) => boolean;
  /** Sửa tên bài/ca sĩ — chỉ kho nhạc dùng (PATCH /tracks/:id). */
  onEdit?: (row: TrackTableRow, index: number) => void;
  /** Mặc định cho phép sửa mọi hàng khi `onEdit` có mặt. */
  canEdit?: (row: TrackTableRow) => boolean;
  /** Bật kéo-thả để đổi thứ tự phát (chỉ playlist dùng). */
  draggable?: boolean;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Cột "Ngày thêm" — chỉ bảng track trong playlist bật. */
  showAddedAt?: boolean;
  extraColumns?: TrackTableExtraColumn[];
  ariaLabel?: string;
}

/**
 * Bảng track dùng chung cho `PlaylistDetail` và `TrackLibrary` (PR #5) — trước
 * đó mỗi trang tự viết một bảng gần như giống hệt nhau, copy-paste. Trang tiếp
 * theo cần danh sách bài ở console quán nên tách trước khi có bản sao thứ ba.
 */
export default function TrackTable({
  rows,
  onPlay,
  onRemove,
  canRemove = () => true,
  onEdit,
  canEdit = () => true,
  draggable = false,
  onReorder,
  showAddedAt = false,
  extraColumns = [],
  ariaLabel = 'Bảng bài hát',
}: TrackTableProps) {
  const { current, isPlaying } = usePlayer();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDropAt = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    onReorder?.(dragIndex, targetIndex);
    setDragIndex(null);
  };

  return (
    <table className="w-full table-fixed text-left" aria-label={ariaLabel}>
      <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-background)' }}>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th
            className="w-10 px-2 py-2 text-xs font-normal md:w-12 md:px-4"
            style={{ color: 'var(--color-foreground-50)' }}
          >
            #
          </th>
          <th className="px-2 py-2 text-xs font-normal" style={{ color: 'var(--color-foreground-50)' }}>
            Tiêu đề
          </th>
          {extraColumns.map((column) => (
            <th
              key={column.key}
              className={`hidden md:table-cell ${column.headerClassName ?? 'px-4 py-2 text-xs font-normal'}`}
              style={{ color: 'var(--color-foreground-50)' }}
            >
              {column.header}
            </th>
          ))}
          {showAddedAt && (
            <th
              className="hidden whitespace-nowrap px-4 py-2 text-xs font-normal md:table-cell md:w-32"
              style={{ color: 'var(--color-foreground-50)' }}
            >
              Ngày thêm
            </th>
          )}
          <th
            className="w-16 px-2 py-2 text-right text-xs font-normal md:w-24 md:px-4"
            style={{ color: 'var(--color-foreground-50)' }}
          >
            <svg
              viewBox="0 0 24 24"
              className="inline-block h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
            <span className="sr-only">Thời lượng</span>
          </th>
          <th className="w-16 px-2 py-2 md:w-24 md:px-4" aria-label="Thao tác" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <TrackRow
            key={row.id}
            row={row}
            index={index}
            isCurrent={current?.id === row.track.id && isPlaying}
            showAddedAt={showAddedAt}
            extraColumns={extraColumns}
            onPlay={onPlay}
            onRemove={onRemove}
            canRemove={canRemove}
            onEdit={onEdit}
            canEdit={canEdit}
            draggable={draggable}
            isDragging={dragIndex === index}
            onDragStart={setDragIndex}
            onDropAt={handleDropAt}
          />
        ))}
      </tbody>
    </table>
  );
}
