import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Github, Download } from 'lucide-react';
import { useLocale } from '../i18n';
import logo from '../assets/logo-rounded.png';

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const { locale, t, toggle } = useLocale();
  const isHome = useLocation().pathname === '/';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-paper-line bg-paper/90 backdrop-blur">
        <nav className="container-wide flex h-14 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity duration-150 hover:opacity-70">
            <img
              src={logo}
              alt="Persona Agent logo"
              className="h-7 w-7 rounded-lg border border-paper-line"
            />
            <span className="text-content font-semibold tracking-tight text-ink">Persona Agent</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="rounded-full border border-paper-line px-3 py-1.5 text-caption font-medium text-ink-soft transition-colors duration-150 hover:border-ink-faint hover:text-ink"
              aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
            >
              {locale === 'zh' ? 'EN' : '中文'}
            </button>
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="text-ink-soft transition-opacity duration-150 hover:opacity-70"
            >
              <Github size={18} strokeWidth={2} />
            </a>
            {isHome ? (
              <a href="#download" className="btn-primary gap-1.5 !px-4 !py-1.5 text-caption">
                <Download size={14} strokeWidth={2} />
                {t('nav.download')}
              </a>
            ) : (
              <Link to="/#download" className="btn-primary gap-1.5 !px-4 !py-1.5 text-caption">
                <Download size={14} strokeWidth={2} />
                {t('nav.download')}
              </Link>
            )}
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-paper-line">
        <div className="container-wide flex flex-col items-start justify-between gap-3 py-8 text-caption text-ink-faint sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Feurther Technologies LLC · {t('footer.claim')}</p>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent"
              target="_blank"
              rel="noreferrer"
              className="transition-opacity duration-150 hover:opacity-70"
            >
              GitHub
            </a>
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent-marketplace"
              target="_blank"
              rel="noreferrer"
              className="transition-opacity duration-150 hover:opacity-70"
            >
              Marketplace
            </a>
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
