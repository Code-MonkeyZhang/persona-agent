import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import { ArrowUpRight, ChevronDown, Link2, Search } from 'lucide-react';
import Layout from '../components/Layout';
import { useLocale } from '../i18n';
import {
  docs,
  DOCS_DEFAULT_SLUG,
  getChapterTitle,
  getSidebarChapters,
  resolveLegacySlug,
  type DocEntry,
  type DocHeading,
} from '../lib/docs';
import 'highlight.js/styles/github.css';

// 插件数组放模块层，避免每次渲染都触发 markdown 重新处理。
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeSlug, rehypeHighlight];

// 手写缓动滚动到指定标题，不依赖浏览器 smooth 实现，也不持有元素引用，
// 重渲染换掉 DOM 节点后依然落点准确，隐藏窗口里由兜底瞬移保证可用。
function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const startY = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const targetY = Math.max(0, Math.min(el.getBoundingClientRect().top + window.scrollY - 80, maxScroll));
  window.history.replaceState(null, '', `#${id}`);

  const jump = () => {
    window.scrollTo(0, targetY);
    window.dispatchEvent(new Event('scroll'));
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || Math.abs(targetY - startY) < 4) {
    jump();
    return;
  }

  const duration = 350;
  const startTime = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    window.scrollTo(0, startY + (targetY - startY) * eased);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      window.dispatchEvent(new Event('scroll'));
    }
  };
  requestAnimationFrame(step);

  // rAF 被挂起的环境里没有动画帧，短延迟后没动就瞬移到位。
  window.setTimeout(() => {
    if (Math.abs(window.scrollY - startY) < 4) {
      jump();
    }
  }, 500);
}

// 取视口顶部基准线下方最近的一个标题作为当前节，整页滚到底时直接取末节。
function findActiveHeading(headings: DocHeading[]): string {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (window.scrollY >= maxScroll - 4) {
    return headings[headings.length - 1].id;
  }
  const line = window.scrollY + 120;
  let current = headings[0]?.id ?? '';
  for (const heading of headings) {
    const el = document.getElementById(heading.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top + window.scrollY <= line) {
      current = heading.id;
    } else {
      break;
    }
  }
  return current;
}

// Mintlify 式标题，悬停时左侧淡入锚点按钮。
function AnchorHeading({
  id,
  level,
  onJump,
  children,
}: {
  id?: string;
  level: 2 | 3;
  onJump?: (id: string) => void;
  children?: ReactNode;
}) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <Tag id={id} className="group relative scroll-mt-20">
      {children}
      {id && (
        <button
          type="button"
          onClick={() => {
            onJump?.(id);
            scrollToHeading(id);
          }}
          aria-label="跳转到本节"
          className="absolute -left-8 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint opacity-0 transition-opacity duration-150 hover:bg-paper-tint hover:text-ink focus:opacity-100 group-hover:opacity-100 sm:flex"
        >
          <Link2 size={13} />
        </button>
      )}
    </Tag>
  );
}

type SidebarChapter = { folder: string; title: string; pages: DocEntry[] };

// 左侧全高侧边栏，章节可折叠，搜索框实时过滤全书页面标题。
function Sidebar({
  chapters,
  currentSlug,
  locale,
}: {
  chapters: SidebarChapter[];
  currentSlug: string;
  locale: 'zh' | 'en';
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentChapter = currentSlug.split('/')[0];

  // 导航到新章节时自动展开它并收起其他章。
  useEffect(() => {
    setExpanded([currentChapter]);
  }, [currentChapter]);

  // 桌面端监听 Cmd 加 K 聚焦搜索框，与输入框右侧的快捷键提示呼应。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      if (!inputRef.current || inputRef.current.offsetParent === null) return;
      event.preventDefault();
      inputRef.current.focus();
      inputRef.current.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const keyword = query.trim().toLowerCase();
  const results = keyword
    ? chapters.flatMap((chapter) =>
        chapter.pages
          .filter((item) => item.title.toLowerCase().includes(keyword))
          .map((item) => ({ item, chapter })),
      )
    : null;

  const linkClass = (active: boolean) =>
    'block rounded-md px-2.5 py-2 text-nav transition-colors duration-100 ' +
    (active
      ? 'bg-paper-tint font-medium text-ink'
      : 'text-ink-soft hover:bg-paper-tint hover:text-ink');

  return (
    <aside className="w-40 shrink-0 border-r border-paper-line sm:w-48 lg:w-56">
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto px-3 py-8 sm:px-4 lg:px-5">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={locale === 'zh' ? '搜索文档' : 'Search docs'}
            className="w-full rounded-lg bg-paper-tint py-2 pl-8 pr-11 text-content text-ink outline-none placeholder:text-ink-faint focus:ring-1 focus:ring-paper-line"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden rounded border border-paper-line bg-paper px-1.5 py-0.5 font-mono text-micro text-ink-faint sm:block">
            ⌘K
          </kbd>
        </div>

        {results ? (
          <nav className="mt-4 flex flex-col gap-0.5">
            {results.map(({ item, chapter }) => (
              <Link key={item.slug} to={`/docs/${item.slug}`} className={linkClass(item.slug === currentSlug)}>
                <span className="mr-1.5 text-caption text-ink-faint">{chapter.title}</span>
                {item.title}
              </Link>
            ))}
            {results.length === 0 && (
              <p className="px-2.5 py-2 text-nav text-ink-faint">
                {locale === 'zh' ? '没有匹配的页面' : 'No results'}
              </p>
            )}
          </nav>
        ) : (
          <nav className="mt-4 flex flex-col">
            {chapters.map((chapter) => {
              const open = expanded.includes(chapter.folder);
              return (
                <div key={chapter.folder} className="mb-1">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) =>
                        prev.includes(chapter.folder)
                          ? prev.filter((folder) => folder !== chapter.folder)
                          : [...prev, chapter.folder],
                      )
                    }
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-body font-medium text-ink-faint transition-colors duration-100 hover:text-ink"
                  >
                    <span>{chapter.title}</span>
                    <ChevronDown
                      size={14}
                      className={'shrink-0 transition-transform duration-150 ' + (open ? '' : '-rotate-90')}
                    />
                  </button>
                  {open && (
                    <div className="mb-1 ml-1.5 flex flex-col gap-0.5 border-l border-paper-line pl-1.5">
                      {chapter.pages.map((item) => (
                        <Link
                          key={item.slug}
                          to={`/docs/${item.slug}`}
                          className={linkClass(item.slug === currentSlug)}
                        >
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}
      </div>
    </aside>
  );
}

// 右侧本页目录，滚动时高亮当前节。
function OnThisPage({
  headings,
  activeId,
  locale,
  onJump,
}: {
  headings: DocHeading[];
  activeId: string;
  locale: 'zh' | 'en';
  onJump: (id: string) => void;
}) {
  if (headings.length === 0) return null;

  return (
    <aside className="hidden w-60 shrink-0 xl:block">
      <div className="sticky top-14 max-h-[calc(100vh-5rem)] overflow-y-auto py-10 pr-8">
        <p className="mb-3 text-caption font-medium text-ink-faint">
          {locale === 'zh' ? '本页目录' : 'On this page'}
        </p>
        <ul className="flex flex-col gap-2 border-l border-paper-line">
          {headings.map((heading) => (
            <li key={heading.id}>
              <button
                type="button"
                onClick={() => {
                  onJump(heading.id);
                  scrollToHeading(heading.id);
                }}
                className={
                  '-ml-px block w-full border-l-2 text-left text-content transition-colors duration-150 ' +
                  (heading.level === 3 ? 'pl-7 ' : 'pl-4 ') +
                  (activeId === heading.id
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-ink-faint hover:text-ink')
                }
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default function Docs() {
  const { locale } = useLocale();
  const splat = useParams()['*'] ?? '';
  const segments = splat.split('/').filter(Boolean);
  const pages = docs[locale];
  const page = pages.find((item) => item.slug === segments.join('/'));
  const [activeId, setActiveId] = useState('');

  const chapters = useMemo(() => getSidebarChapters(locale), [locale]);

  // 切换页面或语言时把滚动位置复位到顶部。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [splat, locale]);

  // 滚动时重算当前节，滚动事件不可用的环境由 scrollToHeading 手动补触发。
  useEffect(() => {
    if (!page || page.headings.length === 0) {
      setActiveId('');
      return;
    }
    const update = () => setActiveId(findActiveHeading(page.headings));
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [page]);

  // 渲染器对象记忆化，目录高亮更新时不重挂整棵 markdown 树。
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href?.startsWith('/')) {
          return <Link to={href}>{children}</Link>;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
      img: ({ src, alt }: { src?: string; alt?: string }) => {
        const resolved = src?.startsWith('/')
          ? import.meta.env.BASE_URL + src.slice(1)
          : src ?? '';
        // 头像类走圆形，其余小图走方形，截图类资源以后按全宽处理。
        const shape = resolved.includes('avatar')
          ? 'inline size-24 rounded-full border border-paper-line'
          : 'inline size-12 rounded-lg';
        return <img src={resolved} alt={alt ?? ''} loading="lazy" className={shape} />;
      },
      h2: ({ id, children }: { id?: string; children?: ReactNode }) => (
        <AnchorHeading id={id} level={2} onJump={setActiveId}>
          {children}
        </AnchorHeading>
      ),
      h3: ({ id, children }: { id?: string; children?: ReactNode }) => (
        <AnchorHeading id={id} level={3} onJump={setActiveId}>
          {children}
        </AnchorHeading>
      ),
    }),
    [],
  );

  if (segments.length === 0) {
    return <Navigate to={`/docs/${DOCS_DEFAULT_SLUG}`} replace />;
  }

  // 旧版单级地址重定向到新结构，章节目录地址跳到该章第一页。
  if (!page) {
    const legacy = segments.length === 1 ? resolveLegacySlug(segments[0]) : undefined;
    if (legacy) {
      return <Navigate to={`/docs/${legacy}`} replace />;
    }
    const chapterFirst = chapters.find((chapter) => chapter.folder === segments[0])?.pages[0];
    if (chapterFirst) {
      return <Navigate to={`/docs/${chapterFirst.slug}`} replace />;
    }
    return <Navigate to={`/docs/${DOCS_DEFAULT_SLUG}`} replace />;
  }

  const currentIndex = pages.findIndex((item) => item.slug === page.slug);
  const next =
    currentIndex >= 0 && currentIndex < pages.length - 1 ? pages[currentIndex + 1] : undefined;

  return (
    <Layout>
      <div className="mx-auto flex w-full max-w-[1440px]">
        <Sidebar chapters={chapters} currentSlug={page.slug} locale={locale} />

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="w-full max-w-[720px] px-6 py-10 lg:py-12">
            {/* 眉标显示章名，大号标题不走 prose 默认样式。 */}
            <header className="mb-8">
              <p className="text-body font-medium text-demo-primary">
                {getChapterTitle(page.chapter, locale)}
              </p>
              <h1 className="mt-2 text-title-display font-semibold tracking-tight text-ink">
                {page.title}
              </h1>
              {page.description && (
                <p className="mt-3 text-content-lg text-ink-soft">{page.description}</p>
              )}
            </header>

            <article className="prose prose-docs prose-neutral max-w-none prose-headings:tracking-tight prose-headings:text-ink prose-p:text-ink-soft prose-li:text-ink-soft prose-strong:text-ink prose-a:text-demo-primary prose-a:decoration-demo-primary/40 hover:prose-a:decoration-demo-primary prose-code:text-ink prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-lg prose-pre:border prose-pre:border-paper-line prose-pre:bg-paper-tint prose-hr:border-paper-line prose-blockquote:border-paper-line">
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={markdownComponents}
              >
                {page.content}
              </ReactMarkdown>
            </article>

            {/* 下一步卡片按全书顺序跨章衔接，最后一页不显示。 */}
            {next && (
              <Link
                to={`/docs/${next.slug}`}
                className="group mt-12 block rounded-2xl border border-paper-line px-6 py-5 transition-colors duration-150 hover:border-ink/30"
              >
                <div className="flex items-center gap-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper-tint text-ink">
                    <ArrowUpRight size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink-faint">
                      {locale === 'zh' ? '下一篇' : 'Up next'}
                    </p>
                    <p className="mt-0.5 truncate text-nav font-medium text-ink">{next.title}</p>
                  </div>
                  <ArrowUpRight
                    size={16}
                    className="shrink-0 text-ink-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  />
                </div>
              </Link>
            )}
          </div>

          <OnThisPage headings={page.headings} activeId={activeId} locale={locale} onJump={setActiveId} />
        </div>
      </div>
    </Layout>
  );
}
