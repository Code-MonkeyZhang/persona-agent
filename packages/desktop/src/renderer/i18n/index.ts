/**
 * @file src/renderer/i18n/index.ts
 * @description i18next 初始化模块，在 main.tsx 中于 React 渲染前导入
 *
 * 语言检测优先级：appStorage(key: "language") > navigator.language > fallback(zh-CN)
 * 切换语言时调用 i18n.changeLanguage()，languageChanged 事件自动持久化到
 * appStorage 并触发全组件重渲染
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { appStorage } from '../lib/appStorage';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

const LANGUAGE_KEY = 'language';

/** 语言检测顺序为已保存值、浏览器语言、默认中文 */
function detectLanguage(): string {
  const saved = appStorage.getItem(LANGUAGE_KEY);
  if (saved === 'en' || saved === 'zh-CN') return saved;
  const nav = typeof navigator === 'undefined' ? '' : navigator.language;
  return nav.toLowerCase().startsWith('en') ? 'en' : 'zh-CN';
}

i18n.use(initReactI18next).init({
  lng: detectLanguage(),
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
  },
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false, // React 已自带 XSS 防护，无需 i18next 转义
  },
});

/** 语言切换后写入 appStorage，保证重启恢复 */
i18n.on('languageChanged', (lng) => {
  appStorage.setItem(LANGUAGE_KEY, lng);
});

export default i18n;
