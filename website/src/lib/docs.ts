import GithubSlugger from 'github-slugger';

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocEntry {
  slug: string;
  chapter: string;
  title: string;
  description?: string;
  content: string;
  headings: DocHeading[];
}

// 章节顺序与页序由这份配置声明，新增页面时加目录加文件名。
export interface DocChapter {
  folder: string;
  zh: string;
  en: string;
  pages: string[];
}

export const CHAPTERS: DocChapter[] = [
  {
    folder: 'getting-started',
    zh: '快速开始',
    en: 'Getting Started',
    pages: ['intro', 'install', 'first-run', 'model-access', 'first-chat'],
  },
  {
    folder: 'agents',
    zh: '角色管理',
    en: 'Agents',
    pages: ['preset', 'create', 'context-memory', 'appearance', 'from-marketplace'],
  },
  {
    folder: 'voice',
    zh: '音色',
    en: 'Voice',
    pages: ['setup', 'presets', 'cloning', 'playback'],
  },
  {
    folder: 'agent-apps',
    zh: 'AgentApp',
    en: 'Agent Apps',
    pages: ['concepts', 'install', 'personalize', 'notifications'],
  },
  {
    folder: 'mcp-tools',
    zh: 'MCP工具',
    en: 'MCP Tools',
    pages: ['concepts', 'install', 'assign', 'builtin'],
  },
  {
    folder: 'skills',
    zh: 'AgentSkill技能',
    en: 'Agent Skills',
    pages: ['concepts', 'install', 'assign'],
  },
  {
    folder: 'remote',
    zh: '远程访问',
    en: 'Remote Access',
    pages: ['tunnel', 'pairing', 'devices', 'sync'],
  },
  {
    folder: 'troubleshooting',
    zh: '故障排查',
    en: 'Troubleshooting',
    pages: ['environment', 'common', 'logs', 'support'],
  },
];

// 旧版单级地址到新结构的重定向表，外部已发出的链接不断。
const LEGACY_SLUGS: Record<string, string> = {
  intro: 'getting-started/intro',
  interface: 'getting-started/first-chat',
  'daily-use': 'getting-started/first-chat',
  settings: 'getting-started/model-access',
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

export const DOCS_DEFAULT_SLUG = `${CHAPTERS[0].folder}/${CHAPTERS[0].pages[0]}`;

export function resolveLegacySlug(slug: string): string | undefined {
  return LEGACY_SLUGS[slug];
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
  return CHAPTERS.flatMap((chapter) =>
    chapter.pages.flatMap((page) => {
      const raw = files[`/src/docs/${locale}/${chapter.folder}/${page}.md`];
      if (!raw) return [];
      const { data, content } = parseFrontmatter(raw);
      const body = stripLeadingH1(content);
      return [
        {
          slug: `${chapter.folder}/${page}`,
          chapter: chapter.folder,
          title: data.title ?? page,
          description: data.description,
          content: body,
          headings: extractHeadings(body),
        },
      ];
    }),
  );
}

export const docs = {
  zh: loadPages(zhFiles, 'zh'),
  en: loadPages(enFiles, 'en'),
};

// 侧边栏分组视图，把平铺页表按章节聚合并带上本地化章名。
export function getSidebarChapters(
  locale: 'zh' | 'en',
): Array<{ folder: string; title: string; pages: DocEntry[] }> {
  const pages = docs[locale];
  return CHAPTERS.map((chapter) => ({
    folder: chapter.folder,
    title: locale === 'zh' ? chapter.zh : chapter.en,
    pages: pages.filter((item) => item.chapter === chapter.folder),
  })).filter((group) => group.pages.length > 0);
}

// 眉标用的章名查询。
export function getChapterTitle(folder: string, locale: 'zh' | 'en'): string {
  const chapter = CHAPTERS.find((item) => item.folder === folder);
  if (!chapter) return '';
  return locale === 'zh' ? chapter.zh : chapter.en;
}
