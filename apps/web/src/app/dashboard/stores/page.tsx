'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../../lib/api-client';
import CoverArt from '../../../components/media/CoverArt';

interface StoreRow {
  id: string;
  name: string;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
}

const STATUS_LABEL: Record<StoreRow['status'], string> = {
  PLAYING: 'Đang phát',
  PAUSED: 'Tạm dừng',
  STOPPED: 'Đang im lặng',
};

const STATUS_COLOR: Record<StoreRow['status'], string> = {
  PLAYING: 'var(--color-accent)',
  PAUSED: '#EAB308',
  STOPPED: 'rgba(248,250,252,0.25)',
};

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');

  const fetchStores = () => {
    api
      .get<{ data: StoreRow[] }>('/stores')
      .then((res) => setStores(res.data))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStores();
    const interval = setInterval(fetchStores, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    setCreating(true);
    try {
      await api.post('/stores', { name: newStoreName });
      setNewStoreName('');
      fetchStores();
      toast.success(`Đã tạo quán "${newStoreName}"`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Tạo quán thất bại');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Quán
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Bấm vào một quán để chọn nhạc và điều khiển phát cho quán đó
        </p>
      </div>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="flex flex-col sm:flex-row gap-3"
        aria-label="Tạo quán"
      >
        <input
          type="text"
          value={newStoreName}
          onChange={(e) => setNewStoreName(e.target.value)}
          placeholder="Tên quán mới..."
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
          aria-label="Tên quán"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? 'Đang tạo...' : 'Thêm quán'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Đang tải danh sách quán...
        </p>
      ) : stores.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Chưa có quán nào.
        </p>
      ) : (
        <div className="grid gap-3">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/dashboard/stores/${store.id}`}
              className="p-4 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all duration-150 hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125"
              style={{
                backgroundColor: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <CoverArt seed={store.id} label={store.name} size={44} />
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                    {store.name}
                  </p>
                  <span className="flex items-center gap-2 mt-0.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLOR[store.status] }}
                      aria-hidden="true"
                    />
                    <span className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
                      {STATUS_LABEL[store.status]}
                    </span>
                  </span>
                </div>
              </div>

              <span
                className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Chọn nhạc →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
