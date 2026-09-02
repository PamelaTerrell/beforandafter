import { Analytics } from '@vercel/analytics/react';
import { useLocation } from 'react-router-dom';
import { isAnalyticsSafeLocation } from '../lib/authRouting';

export default function AnalyticsGate() {
  const location = useLocation();

  if (!isAnalyticsSafeLocation(location)) return null;

  // Supplying route/path disables automatic URL tracking and omits queries/fragments.
  return <Analytics route={location.pathname} path={location.pathname} />;
}
