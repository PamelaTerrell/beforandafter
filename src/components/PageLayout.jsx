import NavBar from './NavBar';
import { Analytics } from '@vercel/analytics/react';
import Footer from './Footer';
import { Helmet } from 'react-helmet';

export default function PageLayout({
  title,
  subtitle,
  description,
  canonical,
  noHeader = false,
  headerRight = null,
  children,
}) {
  const siteName = 'Before & After Vault';
  const baseTitle = title ? `${title} · ${siteName}` : siteName;

  // Safe fallbacks for SSR/build time
  const siteUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://beforeandaftervault.com';
  const pageUrl =
    typeof window !== 'undefined' ? window.location.href : `${siteUrl}/`;
  const defaultOg = `${siteUrl}/og-2.png`; // ← points to /public/og-2.png

  return (
    <>
      <Helmet>
        {/* Basic SEO */}
        <title>{baseTitle}</title>
        {description && <meta name="description" content={description} />}
        <meta name="theme-color" content="#0b57d0" />
        {(canonical || pageUrl) && (
          <link rel="canonical" href={canonical || pageUrl} />
        )}

        {/* Open Graph */}
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={title || siteName} />
        {description && <meta property="og:description" content={description} />}
        {pageUrl && <meta property="og:url" content={pageUrl} />}
        <meta property="og:type" content="website" />
        <meta property="og:image" content={defaultOg} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title || siteName} />
        {description && (
          <meta name="twitter:description" content={description} />
        )}
        <meta name="twitter:image" content={defaultOg} />
      </Helmet>

      <NavBar />
      <main className="container">
        {!noHeader && (
          <header
            className="page-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 12,
            }}
          >
            <div>
              {title && <h1>{title}</h1>}
              {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
            </div>
            {headerRight}
          </header>
        )}
        {children}
        <Analytics />
      </main>
      <Footer />
    </>
  );
}
