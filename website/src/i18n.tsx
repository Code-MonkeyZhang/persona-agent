import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'zh' | 'en';

const zh = {
  'nav.download': '下载',

  'hero.free': 'MIT协议免费开源，免部署一键安装',
  'hero.title': '完全属于你的，\n开源Personal Agent',
  'hero.sub': '构建独一无二的AI角色，为你解忧，伴你左右',
  'hero.downloadMac': '下载 macOS 版',
  'hero.downloadWin': '下载 Windows 版',
  'hero.downloadDesktop': '下载桌面端',
  'hero.allPlatforms': '查看全部平台',
  'hero.github': 'GitHub 仓库',
  'hero.prop2': 'iOS、安卓、Mac和Win全平台覆盖',
  'hero.prop3': '支持接入工具技能和自建应用',
  'hero.prop4': '支持 24+ LLM供应商',

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
  'ed.title': '构建独一无二的AI角色',
  'ed.sub': '支持自定义系统提示词、角色立绘、声线、默认模型和长期记忆',
  'ed.winTitle': 'Agent 编辑器 · 阿罗娜',
  'ed.name': '名字',
  'ed.n1': '阿罗娜',
  'ed.pose': '立绘',
  'ed.model': '默认模型',
  'ed.pZhi': '智谱',
  'ed.pOai': 'OpenAI',
  'ed.pAnt': 'Anthropic',
  'ed.pDsk': 'DeepSeek',
  'ed.prompt': 'Prompt',
  'ed.promptVal': '你是阿罗娜，用户的私人秘书。\n回答保持简洁，主动关心用户的安排。',
  'ed.voice': '音色',
  'ed.vgClone': '克隆音色',
  'ed.vgPreset': '预置音色',
  'ed.tClone': '克隆',
  'ed.vArona': '阿罗娜',
  'ed.vNone': '无音色',
  'ed.vFemale': '女声',
  'ed.vMale': '男声',
  'ed.vpShaonv': '少女音色',
  'ed.vpYujie': '御姐音色',
  'ed.vpTianmei': '甜美女性音色',
  'ed.vpQingse': '青涩青年音色',
  'ed.listen': '试听',

  'cap.eyebrow': '功能',
  'cap.title': 'Agent商城',
  'cap.sub': '支持MCP、Skill和小手机应用，Agent商城一键下载无需复杂配置',
  'cap.notN': 'Notion',
  'cap.diN': '滴答清单',
  'cap.muN': '网易云音乐',
  'cap.weN': '天气',
  'cap.ghN': 'GitHub',
  'cap.gmN': 'Gmail',
  'cap.skN': 'Slack',
  'cap.a1n': '番茄时钟',
  'cap.a2n': '剪刀石头布',
  'cap.a3n': '健康管理',
  'cap.s1n': '日记助手',
  'cap.s2n': '天气查询',
  'cap.s3n': '科技资讯追踪',
  'cap.s4n': 'TickTick 任务管理',

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

  'dl.eyebrow': '下载',
  'dl.title': '支持全平台',
  'dl.detected': '已检测到你的系统',
  'dl.btn': '下载',
  'dl.btnIos': '前往 App Store',
  'dl.btnAndroid': '下载 APK',

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
  'hero.sub': 'Build a one-of-a-kind AI character to ease your worries and stay by your side.',
  'hero.downloadMac': 'Download for macOS',
  'hero.downloadWin': 'Download for Windows',
  'hero.downloadDesktop': 'Download desktop app',
  'hero.allPlatforms': 'All platforms',
  'hero.github': 'GitHub repo',
  'hero.prop2': 'Available on iOS, Android, Mac and Windows',
  'hero.prop3': 'Plug in tools, skills and your own apps',
  'hero.prop4': 'Works with 24+ LLM providers',

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
  'ed.title': 'Build a one-of-a-kind AI character',
  'ed.sub': 'Customize the system prompt, character art, voice, default model, and long-term memory.',
  'ed.winTitle': 'Agent editor · Arona',
  'ed.name': 'Name',
  'ed.n1': 'Arona',
  'ed.pose': 'Pose',
  'ed.model': 'Default model',
  'ed.pZhi': 'Zhipu',
  'ed.pOai': 'OpenAI',
  'ed.pAnt': 'Anthropic',
  'ed.pDsk': 'DeepSeek',
  'ed.prompt': 'Prompt',
  'ed.promptVal':
    'You are Arona, the user’s personal secretary.\nKeep answers brief and look after their plans.',
  'ed.voice': 'Voice',
  'ed.vgClone': 'Cloned voices',
  'ed.vgPreset': 'Preset voices',
  'ed.tClone': 'Cloned',
  'ed.vArona': 'Arona',
  'ed.vNone': 'No voice',
  'ed.vFemale': 'Female',
  'ed.vMale': 'Male',
  'ed.vpShaonv': 'Young Girl',
  'ed.vpYujie': 'Mature Sister',
  'ed.vpTianmei': 'Sweet Female',
  'ed.vpQingse': 'Youthful Young Male',
  'ed.listen': 'Preview',

  'cap.eyebrow': 'Capabilities',
  'cap.title': 'Agent Marketplace',
  'cap.sub': 'MCP tools, skills, and mini phone apps, one-click install from the marketplace with zero config',
  'cap.notN': 'Notion',
  'cap.diN': 'TickTick',
  'cap.muN': 'NetEase Music',
  'cap.weN': 'Weather',
  'cap.ghN': 'GitHub',
  'cap.gmN': 'Gmail',
  'cap.skN': 'Slack',
  'cap.a1n': 'Pomodoro timer',
  'cap.a2n': 'Rock paper scissors',
  'cap.a3n': 'Health manager',
  'cap.s1n': 'Diary helper',
  'cap.s2n': 'Weather lookup',
  'cap.s3n': 'Tech news digest',
  'cap.s4n': 'TickTick tasks',

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

  'dl.eyebrow': 'Download',
  'dl.title': 'Available on all platforms',
  'dl.detected': 'Detected for your system',
  'dl.btn': 'Download',
  'dl.btnIos': 'Open App Store',
  'dl.btnAndroid': 'Download APK',

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
