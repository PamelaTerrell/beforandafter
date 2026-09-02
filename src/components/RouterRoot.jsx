import { Outlet } from 'react-router-dom';
import AnalyticsGate from './AnalyticsGate';

export default function RouterRoot() {
  return (
    <>
      <Outlet />
      <AnalyticsGate />
    </>
  );
}
