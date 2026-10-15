import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'zh' | 'en';

const zh = {
  'nav.features': '特性',
  'nav.market': '商城',
  'nav.mobile': '移动端',
  'nav.download': '下载',

  'hero.eyebrow': '开源 · MIT License · Local First',
  'hero.titleA': '你的个人 AI Agent，',
  'hero.titleB': '完全由你定义',
  'hero.sub': '开源的 personal agent。性格、音色、立绘、工具、技能，全部由你配置。数据留在本地，模型由你选择。',
  'hero.downloadMac': '下载 macOS 版',
  'hero.downloadWin': '下载 Windows 版',
  'hero.downloadDesktop': '下载桌面端',
  'hero.allPlatforms': '查看全部平台',
  'hero.hint': '免费开源 · macOS Apple Silicon / Intel · Windows x64 · iOS · Android',

  'badge.local': 'Local First，无需注册',
  'badge.providers': '24 家模型供应商',
  'badge.tools': '工具与技能按 Agent 分配',
  'badge.memory': '长期记忆自动整理',

  'features.eyebrow': '核心特性',
  'features.title': '不只是一个聊天窗口',
  'features.sub': '从会话到形象，从模型到工具，Persona Agent 把一个 personal agent 该有的每个部分都开放给你配置。',

  'f1.title': '思考过程，看得见',
  'f1.sub': '流式会话里，思考、回复、工具调用分层呈现，Agent 每一步在做什么一目了然。',
  'f1.p1': '思考与工具调用可展开查看',
  'f1.p2': '24 家供应商，模型随时切换',
  'f1.p3': '会话自动总结，整理进长期记忆',

  'f2.title': '有人设，有形象，有声音',
  'f2.sub': '立绘随对话情绪切换表情，陪伴 pane 常驻桌面，MiniMax 音色让 Agent 开口说话。',
  'f2.p1': '立绘按情绪自动切换',
  'f2.p2': '预设音色与录音克隆',
  'f2.p3': '背景图与形象完全自定义',

  'f3.title': '每一个细节都由你定义',
  'f3.sub': 'Agent 编辑器把全部控制权交给你，从 System Prompt 到默认模型，从形象到工具分配。',
  'f3.p1': '人设、模型、步数逐项可调',
  'f3.p2': '立绘与背景图自由上传',
  'f3.p3': '工具与技能按 Agent 精确分配',

  'alt.chat': 'Persona Agent 桌面端对话界面',
  'alt.companion': 'Persona Agent 陪伴形象界面',
  'alt.editor': 'Persona Agent 编辑器界面',
  'alt.market': 'Persona Agent 商城界面',
  'alt.mobile': 'Persona Mobile 陪伴形象界面',

  'market.eyebrow': '商城',
  'market.title': '能力与人，都从这里装进来',
  'market.sub': '智能体、工具、技能、应用四类商品一键安装，商城目录由开源仓库驱动，人人可以投稿。',
  'market.tabAgents': '智能体',
  'market.tabTools': '工具',
  'market.tabSkills': '技能',
  'market.tabApps': '应用',
  'market.note': '已装内容本地加载，断网也能完整使用 · 经 GitHub 投稿收录新商品',

  'mobile.eyebrow': '移动端',
  'mobile.title': '出门在外，也在你身边',
  'mobile.sub': '桌面端一键开启隧道，手机粘贴公网地址即可连接。全部 Agent、技能与工具随身携带，会话实时同步。',
  'mobile.s1t': '桌面端开启隧道',
  'mobile.s1d': '设置里一键启动 Cloudflare 隧道，获得公网地址',
  'mobile.s2t': '手机粘贴地址',
  'mobile.s2d': 'Persona Mobile 里粘贴公网地址，点击连接',
  'mobile.s3t': '连接即聊',
  'mobile.s3d': 'Agent 配置与技能全部可用，立绘与语音同步体验',

  'dl.eyebrow': '下载',
  'dl.title': '下载 Persona Agent',
  'dl.sub': '桌面端与移动端，同一份 Agent 配置，同一份记忆。所有安装包由 GitHub Releases 分发。',
  'dl.detected': '已检测到你的系统',
  'dl.metaMacArm': 'Apple M1 及以上 · DMG 安装包',
  'dl.metaMacX64': 'Intel 芯片 Mac · DMG 安装包',
  'dl.metaWin': 'Windows 10 及以上 · EXE 安装程序',
  'dl.metaIos': 'iPhone / iPad · App Store',
  'dl.metaAndroid': 'Android 8.0 及以上 · APK',
  'dl.btn': '下载',
  'dl.btnIos': '前往 App Store',
  'dl.btnAndroid': '下载 APK',
  'dl.foot':
    'macOS 打开 DMG 拖入 Applications 即可 · Windows 运行 EXE 按提示完成安装 · 全部版本与更新日志见 GitHub Releases',

  'oss.eyebrow': 'Open Source',
  'oss.title': '开源 · 自托管 · 属于你',
  'oss.sub': 'MIT 协议。三个仓库构成完整生态，每一行代码都可以审查，欢迎参与共建。',
  'oss.c1t': '桌面端主仓',
  'oss.c1d': 'Server 与 Desktop 全部源码，Bun + Electron + React',
  'oss.c2t': '移动端',
  'oss.c2d': 'React Native 远程客户端，iOS 与 Android',
  'oss.c3t': '商城目录',
  'oss.c3d': '商品数据仓，PR 投稿即收录',

  'footer.claim': 'Persona Agent — 开源 personal agent',
  'doc.title': 'Persona Agent — 开源 personal agent',
};

const en: typeof zh = {
  'nav.features': 'Features',
  'nav.market': 'Marketplace',
  'nav.mobile': 'Mobile',
  'nav.download': 'Download',

  'hero.eyebrow': 'Open Source · MIT License · Local First',
  'hero.titleA': 'Your personal AI agent.',
  'hero.titleB': 'Fully yours.',
  'hero.sub': 'An open-source personal agent. Persona, voice, artwork, tools and skills — all configured by you. Data stays local, models are your choice.',
  'hero.downloadMac': 'Download for macOS',
  'hero.downloadWin': 'Download for Windows',
  'hero.downloadDesktop': 'Download desktop app',
  'hero.allPlatforms': 'All platforms',
  'hero.hint': 'Free & open source · macOS Apple Silicon / Intel · Windows x64 · iOS · Android',

  'badge.local': 'Local First, no sign-up',
  'badge.providers': '24 model providers',
  'badge.tools': 'Tools & skills assigned per agent',
  'badge.memory': 'Long-term memory, auto curated',

  'features.eyebrow': 'Features',
  'features.title': 'More than a chat window',
  'features.sub': 'From sessions to appearance, from models to tools — every part of a personal agent is yours to configure.',

  'f1.title': 'See how it thinks',
  'f1.sub': 'Thinking, replies and tool calls are layered in the streaming session — every step of the agent is visible.',
  'f1.p1': 'Expandable thinking & tool calls',
  'f1.p2': '24 providers, switch models anytime',
  'f1.p3': 'Sessions summarized into long-term memory',

  'f2.title': 'A persona, a face, a voice',
  'f2.sub': 'Artwork switches expression with the mood of the conversation, the companion pane stays on your desktop, MiniMax voices let your agent speak.',
  'f2.p1': 'Expressions follow the conversation',
  'f2.p2': 'Preset voices & voice cloning',
  'f2.p3': 'Fully custom artwork & backgrounds',

  'f3.title': 'Every detail, defined by you',
  'f3.sub': 'The agent editor hands you full control — from System Prompt to default model, from appearance to tool assignment.',
  'f3.p1': 'Persona, model and steps all adjustable',
  'f3.p2': 'Upload artwork & backgrounds freely',
  'f3.p3': 'Assign tools & skills per agent',

  'alt.chat': 'Persona Agent desktop chat interface',
  'alt.companion': 'Persona Agent companion artwork interface',
  'alt.editor': 'Persona Agent editor interface',
  'alt.market': 'Persona Agent marketplace interface',
  'alt.mobile': 'Persona Mobile companion artwork interface',

  'market.eyebrow': 'Marketplace',
  'market.title': 'Install capabilities, adopt agents',
  'market.sub': 'Agents, tools, skills and apps — one click to install. The catalog lives in an open repository, anyone can submit.',
  'market.tabAgents': 'Agents',
  'market.tabTools': 'Tools',
  'market.tabSkills': 'Skills',
  'market.tabApps': 'Apps',
  'market.note': 'Installed items load locally, fully usable offline · new items reviewed via GitHub PR',

  'mobile.eyebrow': 'Mobile',
  'mobile.title': 'With you, wherever you are',
  'mobile.sub': 'Open a tunnel on desktop with one click, paste the public URL on your phone and connect. Every agent, skill and tool travels with you, sessions sync in real time.',
  'mobile.s1t': 'Open a tunnel on desktop',
  'mobile.s1d': 'Start a Cloudflare tunnel in settings to get a public URL',
  'mobile.s2t': 'Paste the URL on your phone',
  'mobile.s2d': 'Paste the public URL in Persona Mobile and tap connect',
  'mobile.s3t': 'Connect and chat',
  'mobile.s3d': 'All agent configs and skills ready, artwork and voice included',

  'dl.eyebrow': 'Download',
  'dl.title': 'Get Persona Agent',
  'dl.sub': 'Desktop and mobile share the same agent configs and memory. All installers ship via GitHub Releases.',
  'dl.detected': 'Detected for your system',
  'dl.metaMacArm': 'Apple M1 and later · DMG installer',
  'dl.metaMacX64': 'Intel-based Mac · DMG installer',
  'dl.metaWin': 'Windows 10 and later · EXE installer',
  'dl.metaIos': 'iPhone / iPad · App Store',
  'dl.metaAndroid': 'Android 8.0 and later · APK',
  'dl.btn': 'Download',
  'dl.btnIos': 'Open App Store',
  'dl.btnAndroid': 'Download APK',
  'dl.foot':
    'macOS: open the DMG and drag into Applications · Windows: run the EXE installer · full changelog on GitHub Releases',

  'oss.eyebrow': 'Open Source',
  'oss.title': 'Open source. Self-hosted. Yours.',
  'oss.sub': 'MIT licensed. Three repositories form the full ecosystem — every line is auditable, contributions welcome.',
  'oss.c1t': 'Desktop monorepo',
  'oss.c1d': 'Full source of server & desktop, Bun + Electron + React',
  'oss.c2t': 'Mobile app',
  'oss.c2d': 'React Native remote client for iOS and Android',
  'oss.c3t': 'Marketplace catalog',
  'oss.c3d': 'The item data repository, submit via PR',

  'footer.claim': 'Persona Agent — the open-source personal agent',
  'doc.title': 'Persona Agent — the open-source personal agent',
};

export type I18nKey = keyof typeof zh;

const dictionaries: Record<Locale, Record<I18nKey, string>> = { zh, en };

export const DOC_TITLES: Record<Locale, string> = {
  zh: zh['doc.title'],
  en: en['doc.title'],
};

type LocaleContextValue = {
  locale: Locale;
  t: (key: I18nKey) => string;
  toggle: () => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh',
  t: (key) => dictionaries.zh[key],
  toggle: () => {},
});

const STORAGE_KEY = 'pa-locale';

function readInitialLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // localStorage 在隐私模式下可能不可用，回退到浏览器语言检测
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // 忽略持久化失败，切换仍在本会话内生效
    }
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = DOC_TITLES[locale];
  }, [locale]);

  const value: LocaleContextValue = {
    locale,
    t: (key) => dictionaries[locale][key],
    toggle: () => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh')),
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
