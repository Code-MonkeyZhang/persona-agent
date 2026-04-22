/**
 * @file components/CodeBlock.tsx
 * @description 代码块组件，提供语言标签、复制按钮和超长代码自动折叠功能
 */

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

const COLLAPSE_THRESHOLD = 7;

function getLangName(lang: string): string {
  if (!lang) return 'code';
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript JSX',
    js: 'JavaScript',
    jsx: 'JavaScript JSX',
    py: 'Python',
    rs: 'Rust',
    sh: 'Shell',
    yml: 'YAML',
    md: 'Markdown',
  };
  return (
    map[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1)
  );
}

interface CodeBlockProps {
  lang: string;
  code: string;
  highlightElement: ReactNode;
}

/**
 * 代码块展示组件，包含 header bar（语言名+操作按钮）、代码体、折叠/展开逻辑。
 * 超过 COLLAPSE_THRESHOLD 行时默认折叠，折叠时显示渐变遮罩和"展开全部 N 行"按钮。
 */
export function CodeBlock({ lang, code, highlightElement }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lineCount = code.split('\n').filter((l) => l.trim() !== '').length;
  const canCollapse = lineCount > COLLAPSE_THRESHOLD;
  const langName = getLangName(lang);

  useEffect(() => {
    if (canCollapse) {
      setCollapsed(true);
    }
  }, [canCollapse]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="code-block-wrapper my-2">
      <div className="code-block-header">
        <div className="code-block-lang">
          <span className="code-block-lang-name">{langName}</span>
        </div>
        <div className="code-block-actions">
          {canCollapse && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="code-block-action-btn"
              title={collapsed ? '展开' : '折叠'}
            >
              {collapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
              <span>{collapsed ? '展开' : '折叠'}</span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className="code-block-action-btn"
            title="复制"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>
      <div
        className={cn('code-block-body', collapsed && 'code-block-collapsed')}
      >
        {highlightElement}
      </div>
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="code-block-expand-overlay"
        >
          <ChevronDown className="w-4 h-4" />
          <span>展开全部 {lineCount} 行</span>
        </button>
      )}
    </div>
  );
}
