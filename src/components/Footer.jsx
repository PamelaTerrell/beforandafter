import { Link } from 'react-router-dom';

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
        <Link to="/privacy">Privacy &amp; sharing</Link>
      </div>
    </footer>
  );
}
