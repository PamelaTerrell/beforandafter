export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <p>
          Built with ❤️ by{" "}
          <a
            href="https://pamelajterrell.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Pamela J. Terrell
          </a>
          . © {year} Before &amp; After Vault
        </p>
      </div>
    </footer>
  );
}
