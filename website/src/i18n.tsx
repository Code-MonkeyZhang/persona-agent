import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'zh' | 'en';

const zh = {
  'nav.download': '下载',

  'hero.free': 'MIT协议免费开源，免部署一键安装',
  'hero.title': '完全属于你的，\n开源Personal Agent',
  'hero.sub': 'AI角色立绘声线性格完全自定义，构建独一无二的AI角色。',
  'hero.downloadMac': '下载 macOS 版',
  'hero.downloadWin': '下载 Windows 版',
  'hero.downloadDesktop': '下载桌面端',
  'hero.allPlatforms': '查看全部平台',
  'hero.github': 'GitHub 仓库',
  'hero.prop2': 'iOS、安卓、Mac和Win全平台覆盖',
  'hero.prop3': '支持接入工具技能和自建应用',

  'hwin.s1': '聊天',
  'hwin.btnCompanion': '陪伴',
  'hwin.userMsg': '明天北京天气怎么样？需要带伞吗',
  'hwin.thinking': '正在思考 · 3 步',
  'hwin.thinkLines': '用户问的是明天北京的降水概率|需要调用天气工具拿到预报数据|结合早晚通勤时间给出建议',
  'hwin.tool': '天气查询 · Beijing · 0.4s',
  'hwin.replyLines': '明天北京小雨，通勤时段降雨概率 80%|出门记得带伞|要不要帮你定个明早带伞的提醒？',
  'hwin.inputPh': '给阿罗娜发消息…',

  'comp.userMsg': '今天忙了一天，好累呀',
  'comp.thinking': '正在思考…',
  'comp.b1': '今天辛苦啦，下午连着开了三个会吧？',
  'comp.b2': '晚上就别再赶工了，早点休息，我在这儿陪你。',

  'ed.eyebrow': '编辑',
  'ed.title': '每一个细节都由你定义',
  'ed.sub': 'Agent 编辑器把全部控制权交给你。立绘、模型、System Prompt、音色逐项可调。',
  'ed.winTitle': 'Agent 编辑器 · 阿罗娜',
  'ed.basic': '基本信息',
  'ed.name': '名字',
  'ed.desc': '简介',
  'ed.descVal': '你的私人秘书，日程管理与日常事务',
  'ed.n1': '阿罗娜',
  'ed.appearance': '外观',
  'ed.pose': '立绘',
  'ed.applied': '已应用 · 三套表情',
  'ed.bg': '背景图',
  'ed.change': '更换',
  'ed.modelCard': '模型配置',
  'ed.model': '默认模型',
  'ed.modelDim': '智谱 · 24 家可换',
  'ed.prompt': 'System Prompt',
  'ed.promptVal': '你是阿罗娜，用户的私人秘书，负责日程管理与日常事务。\n回答保持简洁，主动关心用户的安排。',
  'ed.voiceCard': '音色',
  'ed.vNone': '无音色',
  'ed.vFemale': '女声',
  'ed.vMale': '男声',
  'ed.vClone': '克隆音色',
  'ed.listen': '试听',

  'cap.eyebrow': '功能',
  'cap.title': '工具、技能，与小手机 AgentApp',
  'cap.sub': '接入、安装、运行，都在这三个页面里切换。',
  'cap.winTitle': '能力中心 · Persona Agent',
  'cap.tabTools': '工具',
  'cap.tabSkills': '技能',
  'cap.tabPhone': '小手机',
  'cap.grpAssigned': '已分配工具',
  'cap.grpPool': '未分配工具',
  'cap.assignAria': '分配给当前 Agent',
  'cap.unassignAria': '取消分配',
  'cap.fsSt': '已连接 · 4 功能',
  'cap.wtSt': '已连接 · 3 功能',
  'cap.ppSt': '未连接 · 12 功能',
  'cap.appSt': 'Agent App',
  'cap.appRowN': '小手机冒险',
  'cap.typeMcp': '第三方工具 · MCP',
  'cap.typeApp': 'Agent App',
  'cap.fieldStatus': '连接状态',
  'cap.stConnected': '已连接',
  'cap.stOff': '未连接',
  'cap.fieldUrl': '工具地址',
  'cap.fieldFns': '功能',
  'cap.reconnect': '重新连接',
  'cap.uninstall': '卸载',
  'cap.s1n': '天气查询',
  'cap.s1d': '城市预报与出行建议',
  'cap.s2n': '网页阅读',
  'cap.s2d': '链接进去摘要提取',
  'cap.s3n': '番茄钟',
  'cap.s3d': '专注循环与统计',
  'cap.s4n': '长期记忆',
  'cap.s4d': '会话自动沉淀',
  'cap.a1n': '小算盘',
  'cap.a1d': 'Agent 写的记账小应用',
  'cap.a2n': '弹幕钢琴',
  'cap.a2d': '立绘互动小游戏',
  'cap.a3n': '冒险地图',
  'cap.a3d': '文字冒险面板',
  'cap.running': '运行中',

  'tun.eyebrow': '移动端',
  'tun.title': '支持移动端远程连接',
  'tun.sub': '让你的AI角色时刻跟随，随时进行对话',
  'tun.appStore': 'App Store 下载',
  'tun.apk': '安卓 APK 下载',

  'mob.banner': '已连接 · 阿罗娜桌面端',
  'mob.tunnel': '隧道已开启',
  'mob.sessions': '会话',
  'mob.agent2': '牧濐红莉栖',
  'mob.s1t': '晚间陪伴',
  'mob.s1p': '晚上就别再赶工了，早点休息…',
  'mob.s1time': '21:04',
  'mob.s2t': '周报整理',
  'mob.s2p': '大纲已经列好，回去看细节',
  'mob.s2time': '昨天',
  'mob.s3t': '读书笔记',
  'mob.s3p': '本周读完了第三章',
  'mob.s3time': '周二',

  'market.eyebrow': '商城',
  'market.title': '能力与人，都从这里装进来',
  'market.sub': '四类商品一键安装，目录由 GitHub 仓库驱动，人人可以投稿。',
  'market.search': '搜索商城…',
  'market.tabAgents': '智能体',
  'market.tabTools': '工具',
  'market.tabSkills': '技能',
  'market.tabApps': '应用',
  'mkt.winTitle': '商城 · Marketplace',
  'mkt.p1n': '天气查询',
  'mkt.p1d': '全球城市三日预报',
  'mkt.p2n': '网页阅读',
  'mkt.p2d': '链接进去摘要提取',
  'mkt.p3n': '阿罗娜',
  'mkt.p3d': '温柔可靠的日常伙伴',
  'mkt.p4n': '小算盘',
  'mkt.p4d': '记账与开销分析助手',
  'mkt.install': '安装',
  'mkt.installed': '已安装',

  'eco.eyebrow': '生态',
  'eco.title': '模型生态',
  'eco.sub': '云端、开源权重、本机部署都支持。',
  'eco.chips':
    'OpenAI,Anthropic,Gemini,DeepSeek,Kimi,通义千问,智谱 GLM,MiniMax,豆包,混元,xAI,Mistral,OpenRouter,硅基流动,Ollama,LM Studio',

  'dl.eyebrow': '下载',
  'dl.title': '支持全平台',
  'dl.detected': '已检测到你的系统',
  'dl.btn': '下载',
  'dl.btnIos': '前往 App Store',
  'dl.btnAndroid': '下载 APK',
  'dl.foot':
    'macOS 打开 DMG 拖入 Applications 即可 · Windows 运行 EXE 按提示完成安装 · 全部版本与更新日志见 GitHub Releases',

  'oss.c1t': '桌面端主仓',
  'oss.c1d': 'Server 与 Desktop 全部源码，Bun + Electron + React',
  'oss.c2t': '移动端',
  'oss.c2d': 'React Native 远程客户端，iOS 与 Android',
  'oss.c3t': '商城目录',
  'oss.c3d': '商城商品的数据仓',

  'footer.claim': 'Persona Agent',
  'doc.title': 'Persona Agent',
};

const en: typeof zh = {
  'nav.download': 'Download',

  'hero.free': 'Free and open source under the MIT license, one click install with zero setup',
  'hero.title': 'Entirely yours,\nthe open-source Personal Agent',
  'hero.sub': 'Fully customize your AI character pose, voice and personality, and build a one-of-a-kind character.',
  'hero.downloadMac': 'Download for macOS',
  'hero.downloadWin': 'Download for Windows',
  'hero.downloadDesktop': 'Download desktop app',
  'hero.allPlatforms': 'All platforms',
  'hero.github': 'GitHub repo',
  'hero.prop2': 'Available on iOS, Android, Mac and Windows',
  'hero.prop3': 'Plug in tools, skills and your own apps',

  'hwin.s1': 'Chat',
  'hwin.btnCompanion': 'Companion',
  'hwin.userMsg': 'Will it rain in Beijing tomorrow? Should I bring an umbrella?',
  'hwin.thinking': 'Thinking · 3 steps',
  'hwin.thinkLines':
    'The user asks about rain probability in Beijing|Call the weather tool for forecast data|Tie the advice to commute hours',
  'hwin.tool': 'weather · Beijing · 0.4s',
  'hwin.replyLines':
    'Light rain tomorrow in Beijing, 80% during commute hours|Bring an umbrella|Want a reminder for tomorrow morning?',
  'hwin.inputPh': 'Message Arona…',

  'comp.userMsg': 'Such a long day, I am exhausted',
  'comp.thinking': 'Thinking…',
  'comp.b1': 'Long day, right? Three back-to-back meetings this afternoon.',
  'comp.b2': 'No more work tonight, rest early. I will be right here with you.',

  'ed.eyebrow': 'Editor',
  'ed.title': 'Every detail, defined by you',
  'ed.sub': 'The agent editor hands you full control. Pose, model, System Prompt and voice, each adjustable.',
  'ed.winTitle': 'Agent editor · Arona',
  'ed.basic': 'Basic info',
  'ed.name': 'Name',
  'ed.desc': 'Description',
  'ed.descVal': 'Your private secretary for schedules and daily errands',
  'ed.n1': 'Arona',
  'ed.appearance': 'Appearance',
  'ed.pose': 'Pose',
  'ed.applied': 'Applied · 3 poses',
  'ed.bg': 'Background',
  'ed.change': 'Change',
  'ed.modelCard': 'Model',
  'ed.model': 'Default model',
  'ed.modelDim': 'Zhipu · 24 providers',
  'ed.prompt': 'System Prompt',
  'ed.promptVal':
    'You are Arona, the user’s personal secretary handling schedules and daily affairs.\nKeep answers brief and look after the user’s plans.',
  'ed.voiceCard': 'Voice',
  'ed.vNone': 'No voice',
  'ed.vFemale': 'Female',
  'ed.vMale': 'Male',
  'ed.vClone': 'Cloned',
  'ed.listen': 'Preview',

  'cap.eyebrow': 'Capabilities',
  'cap.title': 'Tools, skills, and pocket AgentApps',
  'cap.sub': 'Connect, install, and run, all in these three switchable panes.',
  'cap.winTitle': 'Capabilities · Persona Agent',
  'cap.tabTools': 'Tools',
  'cap.tabSkills': 'Skills',
  'cap.tabPhone': 'Pocket phone',
  'cap.grpAssigned': 'Assigned tools',
  'cap.grpPool': 'Unassigned tools',
  'cap.assignAria': 'Assign to the current agent',
  'cap.unassignAria': 'Unassign',
  'cap.fsSt': 'Connected · 4 tools',
  'cap.wtSt': 'Connected · 3 tools',
  'cap.ppSt': 'Not connected · 12 tools',
  'cap.appSt': 'Agent App',
  'cap.appRowN': 'Pocket Adventure',
  'cap.typeMcp': 'Third-party · MCP',
  'cap.typeApp': 'Agent App',
  'cap.fieldStatus': 'Connection',
  'cap.stConnected': 'Connected',
  'cap.stOff': 'Not connected',
  'cap.fieldUrl': 'Server URL',
  'cap.fieldFns': 'Functions',
  'cap.reconnect': 'Reconnect',
  'cap.uninstall': 'Uninstall',
  'cap.s1n': 'Weather lookup',
  'cap.s1d': 'City forecasts and travel advice',
  'cap.s2n': 'Web reader',
  'cap.s2d': 'Summarizes any link you paste',
  'cap.s3n': 'Pomodoro',
  'cap.s3d': 'Focus cycles with stats',
  'cap.s4n': 'Long-term memory',
  'cap.s4d': 'Sessions distilled automatically',
  'cap.a1n': 'Mini abacus',
  'cap.a1d': 'A bookkeeping app written by the agent',
  'cap.a2n': 'Barrage piano',
  'cap.a2d': 'A mini game that plays with the artwork',
  'cap.a3n': 'Adventure map',
  'cap.a3d': 'A text adventure panel',
  'cap.running': 'Running',

  'tun.eyebrow': 'Mobile',
  'tun.title': 'Remote connection from mobile',
  'tun.sub': 'Your AI character follows you everywhere, ready for a conversation anytime.',
  'tun.appStore': 'Download on the App Store',
  'tun.apk': 'Android APK download',

  'mob.banner': 'Connected · Arona desktop',
  'mob.tunnel': 'Tunnel on',
  'mob.sessions': 'Sessions',
  'mob.agent2': 'Makise Kurisu',
  'mob.s1t': 'Evening companion',
  'mob.s1p': 'No more work tonight, rest early…',
  'mob.s1time': '21:04',
  'mob.s2t': 'Weekly report',
  'mob.s2p': 'Outline is ready, check the details',
  'mob.s2time': 'Yesterday',
  'mob.s3t': 'Reading notes',
  'mob.s3p': 'Finished chapter three this week',
  'mob.s3time': 'Tue',

  'market.eyebrow': 'Marketplace',
  'market.title': 'Install capabilities, adopt agents',
  'market.sub': 'Four kinds of items, one click to install. The catalog lives in a GitHub repository and anyone can submit.',
  'market.search': 'Search the marketplace…',
  'market.tabAgents': 'Agents',
  'market.tabTools': 'Tools',
  'market.tabSkills': 'Skills',
  'market.tabApps': 'Apps',
  'mkt.winTitle': 'Marketplace · Marketplace',
  'mkt.p1n': 'Weather lookup',
  'mkt.p1d': 'Three-day forecasts for cities worldwide',
  'mkt.p2n': 'Web reader',
  'mkt.p2d': 'Summarizes any link you paste',
  'mkt.p3n': 'Arona',
  'mkt.p3d': 'A gentle and reliable daily companion',
  'mkt.p4n': 'Mini abacus',
  'mkt.p4d': 'Bookkeeping and spending analysis',
  'mkt.install': 'Install',
  'mkt.installed': 'Installed',

  'eco.eyebrow': 'Ecosystem',
  'eco.title': 'Model ecosystem',
  'eco.sub': 'Cloud, open-weight, and fully local deployments are all supported.',
  'eco.chips':
    'OpenAI,Anthropic,Gemini,DeepSeek,Kimi,Qwen,Zhipu GLM,MiniMax,Doubao,Hunyuan,xAI,Mistral,OpenRouter,SiliconFlow,Ollama,LM Studio',

  'dl.eyebrow': 'Download',
  'dl.title': 'Available on all platforms',
  'dl.detected': 'Detected for your system',
  'dl.btn': 'Download',
  'dl.btnIos': 'Open App Store',
  'dl.btnAndroid': 'Download APK',
  'dl.foot':
    'macOS: open the DMG and drag into Applications · Windows: run the EXE installer · full changelog on GitHub Releases',

  'oss.c1t': 'Desktop monorepo',
  'oss.c1d': 'Full source of server & desktop, Bun + Electron + React',
  'oss.c2t': 'Mobile app',
  'oss.c2d': 'React Native remote client for iOS and Android',
  'oss.c3t': 'Marketplace catalog',
  'oss.c3d': 'The data repository behind the marketplace',

  'footer.claim': 'Persona Agent',
  'doc.title': 'Persona Agent',
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
