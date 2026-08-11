import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-paper-line">
        <nav className="container-wide flex h-14 items-center justify-between">
          <Link
            to="/"
            className="text-sm font-semibold tracking-tight text-ink transition-opacity duration-150 hover:opacity-70"
          >
            Persona Agent
          </Link>
          <div className="flex items-center gap-6 text-sm text-ink-soft">
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent"
              target="_blank"
              rel="noreferrer"
              className="transition-opacity duration-150 hover:opacity-70"
            >
              GitHub
            </a>
            <Link
              to="/privacy-policy"
              className="transition-opacity duration-150 hover:opacity-70"
            >
              Privacy
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-paper-line">
        <div className="container-wide flex flex-col items-start justify-between gap-3 py-8 text-xs text-ink-faint sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Feurther Technologies LLC</p>
          <div className="flex items-center gap-5">
            <Link to="/privacy-policy" className="transition-opacity duration-150 hover:opacity-70">
              Privacy Policy
            </Link>
            <a
              href="mailto:yufengzhang483@gmail.com"
              className="transition-opacity duration-150 hover:opacity-70"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
