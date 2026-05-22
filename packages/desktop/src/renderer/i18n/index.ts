/**
 * @file src/renderer/i18n/index.ts
 * @description i18next 初始化模块，在 main.tsx 中于 React 渲染前导入
 *
 * 语言检测优先级：localStorage(key: "language") > navigator.language > fallback(zh-CN)
 * 切换语言时调用 i18n.changeLanguage()，会自动持久化到 localStorage 并触发全组件重渲染
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en },
    },
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false, // React 已自带 XSS 防护，无需 i18next 转义
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
  });

export default i18n;
