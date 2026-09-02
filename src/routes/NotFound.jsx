import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';

export default function NotFound() {
  return (
    <PageLayout title="Page not found" noIndex>
      <div className="empty-state">
        <span className="eyebrow">404</span>
        <h2>That page isn’t in the vault</h2>
        <p>The link may be outdated, or the page may have moved.</p>
        <Link to="/" className="button primary">Return home</Link>
      </div>
    </PageLayout>
  );
}
