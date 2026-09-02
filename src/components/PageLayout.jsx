import NavBar from './NavBar';
import Footer from './Footer';

export default function PageLayout({
  title,
  subtitle,
  description,
  canonical,
  noIndex = false,
  ogImage,
  ogType = 'website',
  noHeader = false,
  headerRight = null,
  children,
}) {
  const siteName = 'Before & After Vault';
  const baseTitle = title && title !== siteName ? `${title} · ${siteName}` : siteName;

  // Safe fallbacks for SSR/build time
  const siteUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://beforeandaftervault.com';
  const pageUrl =
    typeof window !== 'undefined'
      ? `${siteUrl}${window.location.pathname}`
      : `${siteUrl}/`;
  const defaultOg = `${siteUrl}/og-2.png`; // ← points to /public/og-2.png
  const resolvedUrl = canonical || pageUrl;
  const resolvedOgImage = ogImage || defaultOg;

  return (
    <>
      <title>{baseTitle}</title>
      {description && <meta name="description" content={description} />}
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      <meta name="theme-color" content="#1559b7" />
      <link rel="canonical" href={resolvedUrl} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={title || siteName} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={resolvedUrl} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={resolvedOgImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title || siteName} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={resolvedOgImage} />

      <a className="skip-link" href="#main-content">Skip to main content</a>
      <NavBar />
      <main id="main-content" className="container" tabIndex="-1">
        {!noHeader && (
          <header className="page-header">
            <div>
              {title && <h1>{title}</h1>}
              {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
            </div>
            {headerRight}
          </header>
        )}
        {children}
      </main>
      <Footer />
    </>
  );
}
