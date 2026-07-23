'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';

interface Store {
  id: string;
  name: string;
  syncGroupId: string | null;
  storeOverride?: {
    isOverridden: boolean;
    overriddenAt: string | null;
  } | null;
}

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');

  const fetchStores = () => {
    api
      .get<{ data: Store[] }>('/stores')
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
    } finally {
      setCreating(false);
    }
  };

  const handleRejoin = async (storeId: string) => {
    await api.post(`/sync/stores/${storeId}/rejoin`);
    fetchStores();
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Stores
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Manage stores and monitor playback status
        </p>
      </div>

      {/* Create store */}
      <form onSubmit={(e) => void handleCreate(e)} className="flex gap-3" aria-label="Create store">
        <input
          type="text"
          value={newStoreName}
          onChange={(e) => setNewStoreName(e.target.value)}
          placeholder="New store name..."
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
          aria-label="Store name"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-90"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? 'Creating...' : 'Add Store'}
        </button>
      </form>

      {/* Stores list */}
      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Loading stores...
        </p>
      ) : stores.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          No stores yet.
        </p>
      ) : (
        <div className="grid gap-3">
          {stores.map((store) => (
            <div
              key={store.id}
              className="p-4 rounded-xl flex items-center justify-between"
              style={{
                backgroundColor: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: store.storeOverride?.isOverridden
                      ? 'var(--color-destructive)'
                      : store.syncGroupId
                        ? 'var(--color-accent)'
                        : 'rgba(248,250,252,0.2)',
                  }}
                />
                <div>
                  <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                    {store.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(248,250,252,0.5)' }}>
                    {store.storeOverride?.isOverridden
                      ? 'Overriding'
                      : store.syncGroupId
                        ? 'In sync group'
                        : 'No group assigned'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {store.storeOverride?.isOverridden && (
                  <button
                    onClick={() => void handleRejoin(store.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all duration-150 hover:opacity-80"
                    style={{ backgroundColor: 'var(--color-secondary)', color: 'white' }}
                  >
                    Rejoin Group
                  </button>
                )}
                <a
                  href={`/player/${store.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all duration-150 hover:brightness-110"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-foreground)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Mở màn hình quán
                </a>
                {/* Bản chỉ hiển thị để treo TV trong quán */}
                <a
                  href={`/player/${store.id}?kiosk=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all duration-150 hover:brightness-110"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--color-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Màn chiếu
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
