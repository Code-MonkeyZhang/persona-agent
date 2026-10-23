import GithubSlugger from 'github-slugger';

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocEntry {
  slug: string;
  title: string;
  description?: string;
  content: string;
  headings: DocHeading[];
}

// 章节顺序由这份配置声明，一章一个文件，文件名即地址。
export interface DocChapter {
  slug: string;
  zh: string;
  en: string;
}

export const CHAPTERS: DocChapter[] = [
  { slug: 'getting-started', zh: '快速开始', en: 'Getting Started' },
  { slug: 'agents', zh: 'AI角色管理', en: 'Agents' },
  { slug: 'agent-apps', zh: 'AgentApp', en: 'Agent Apps' },
  { slug: 'mcp-tools', zh: 'MCP工具', en: 'MCP Tools' },
  { slug: 'skills', zh: 'AgentSkill技能', en: 'Agent Skills' },
  { slug: 'remote', zh: '移动端连接', en: 'Remote Access' },
  { slug: 'troubleshooting', zh: '常见问题', en: 'Troubleshooting' },
];

// 旧版单级地址到新章页的重定向表，外部已发出的链接不断。
const LEGACY_SLUGS: Record<string, string> = {
  intro: 'getting-started',
  interface: 'getting-started',
  'daily-use': 'getting-started',
  settings: 'getting-started',
};

// 已删除的旧目录映射到承接其内容的章。
const LEGACY_FOLDERS: Record<string, string> = {
  voice: 'agents',
};

type RawFiles = Record<string, string>;

const zhFiles = import.meta.glob('/src/docs/zh/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as RawFiles;

const enFiles = import.meta.glob('/src/docs/en/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as RawFiles;

export const DOCS_DEFAULT_SLUG = CHAPTERS[0].slug;

// 旧的单级地址与旧的章加页两级地址都归到对应的章页。
export function resolveLegacySlug(slug: string): string | undefined {
  if (LEGACY_SLUGS[slug]) return LEGACY_SLUGS[slug];
  const segments = slug.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return undefined;
  const folder = LEGACY_FOLDERS[segments[0]] ?? segments[0];
  return CHAPTERS.some((chapter) => chapter.slug === folder) ? folder : undefined;
}

// react-markdown 不认识 frontmatter，渲染前必须剥掉，这里顺手把标题描述取出来。
function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, content: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, content: match[2] };
}

// 页面大标题由 frontmatter 渲染，正文里重复的一级标题在这里剥掉。
function stripLeadingH1(content: string): string {
  return content.replace(/^\s*#\s+[^\n]*\r?\n/, '');
}

// 清掉行内 markdown 语法，让标题文本和渲染结果一致，slug 才能对得上。
function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`~]/g, '')
    .trim();
}

// 提取二三级标题生成本页目录，slug 计算与 rehype-slug 同源，都走 github-slugger。
function extractHeadings(content: string): DocHeading[] {
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(##|###)\s+(.+)$/.exec(line);
    if (!match) continue;
    const text = cleanHeadingText(match[2]);
    if (!text) continue;
    headings.push({ id: slugger.slug(text), text, level: match[1] === '##' ? 2 : 3 });
  }
  return headings;
}

function loadPages(files: RawFiles, locale: 'zh' | 'en'): DocEntry[] {
  return CHAPTERS.flatMap((chapter) => {
    const raw = files[`/src/docs/${locale}/${chapter.slug}.md`];
    if (!raw) return [];
    const { data, content } = parseFrontmatter(raw);
    const body = stripLeadingH1(content);
    return [
      {
        slug: chapter.slug,
        title: data.title ?? (locale === 'zh' ? chapter.zh : chapter.en),
        description: data.description,
        content: body,
        headings: extractHeadings(body),
      },
    ];
  });
}

export const docs = {
  zh: loadPages(zhFiles, 'zh'),
  en: loadPages(enFiles, 'en'),
};

// 侧边栏条目视图，一章一条。
export function getSidebarChapters(locale: 'zh' | 'en'): Array<{ slug: string; title: string }> {
  const loaded = new Set(docs[locale].map((page) => page.slug));
  return CHAPTERS.filter((chapter) => loaded.has(chapter.slug)).map((chapter) => ({
    slug: chapter.slug,
    title: locale === 'zh' ? chapter.zh : chapter.en,
  }));
}
