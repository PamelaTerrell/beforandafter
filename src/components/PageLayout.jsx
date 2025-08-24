import NavBar from './NavBar';
import { Analytics } from '@vercel/analytics/react';
import Footer from './Footer';

export default function PageLayout({ title, subtitle, children }) {
  return (
    <>
      <NavBar />
      <main className="container">
        <header className="page-header">
          <h1>{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </header>
        {children}
        <Analytics />
      </main>
      <Footer />
    </>
  );
}
