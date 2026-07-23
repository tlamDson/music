'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import type { SyncMode, SyncGroupStatus } from '@cafe-music/shared';

export interface SyncGroup {
  id: string;
  name: string;
  mode: SyncMode;
  status: SyncGroupStatus;
  _count?: { stores: number };
}

/**
 * Danh sách sync group của tổ chức. Trước đây web hardcode 'sync-group-main'
 * vì backend chưa có endpoint liệt kê — sai ngay khi chuỗi có nhóm thứ hai.
 */
export function useSyncGroups() {
  const [groups, setGroups] = useState<SyncGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: SyncGroup[] }>('/sync/groups')
      .then((res) => setGroups(res.data))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  return { groups, defaultGroupId: groups[0]?.id ?? null, loading };
}
