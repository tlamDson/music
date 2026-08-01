'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api-client';

const MEASUREMENTS = 5;

export function useClockOffset() {
  const [offset, setOffset] = useState(0);
  const isMeasuring = useRef(false);

  const measureOffset = useCallback(async () => {
    if (isMeasuring.current) return;
    isMeasuring.current = true;

    const offsets: number[] = [];

    for (let i = 0; i < MEASUREMENTS; i++) {
      const t1 = Date.now();
      try {
        const { serverTs } = await api.post<{ serverTs: number }>('/sync/clock');
        const t2 = Date.now();
        const roundTrip = t2 - t1;
        const estimatedServerNow = serverTs + roundTrip / 2;
        offsets.push(estimatedServerNow - t2);
      } catch {
        // ignore measurement failure
      }
    }

    if (offsets.length > 0) {
      const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      setOffset(Math.round(avg));
    }

    isMeasuring.current = false;
  }, []);

  return { offset, measureOffset };
}
