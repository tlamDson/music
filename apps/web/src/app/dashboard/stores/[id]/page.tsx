'use client';

import { useParams } from 'next/navigation';
import StoreDetail from '../../../../components/store/StoreDetail';

export default function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();

  return <StoreDetail storeId={id} />;
}
