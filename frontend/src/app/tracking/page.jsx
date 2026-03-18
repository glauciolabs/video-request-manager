import { TrackingClient } from '@/components/TrackingClient';

export default function TrackingPage({ searchParams }) {
  return <TrackingClient initialId={searchParams?.id || ''} />;
}
