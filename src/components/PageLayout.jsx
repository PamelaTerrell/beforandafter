import NavBar from './NavBar';

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
      </main>
    </>
  );
}
