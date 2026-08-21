/**
 * @file src/renderer/components/common/Markdown.tsx
 * @description Markdown 渲染组件，基于 react-markdown 封装自定义渲染器，内含私有 CodeBlock 子组件
 */

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '../../lib/utils';
import { CopyButton } from '../ui/CopyButton';

/** 代码块超过该行数时默认折叠 */
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
 * 代码块展示组件，包含 header bar、代码体、折叠/展开逻辑。
 * 超过 COLLAPSE_THRESHOLD 行时默认折叠，折叠时显示渐变遮罩和"展开全部 N 行"按钮。
 */
function CodeBlock({ lang, code, highlightElement }: CodeBlockProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const lineCount = code.split('\n').filter((l) => l.trim() !== '').length;
  const canCollapse = lineCount > COLLAPSE_THRESHOLD;
  const langName = getLangName(lang);

  useEffect(() => {
    if (canCollapse) {
      setCollapsed(true);
    }
  }, [canCollapse]);

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
              title={
                collapsed ? t('codeBlock.expand') : t('codeBlock.collapse')
              }
            >
              {collapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
              <span>
                {collapsed ? t('codeBlock.expand') : t('codeBlock.collapse')}
              </span>
            </button>
          )}
          <CopyButton
            text={code}
            className="code-block-action-btn"
            title={t('codeBlock.copy')}
          >
            {(copied) => (
              <>
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>
                  {copied ? t('codeBlock.copied') : t('codeBlock.copy')}
                </span>
              </>
            )}
          </CopyButton>
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
          <span>{t('codeBlock.expandAllLines', { count: lineCount })}</span>
        </button>
      )}
    </div>
  );
}

/**
 * 从 React 元素树中递归提取纯文本内容，用于代码块的复制功能
 */
function getTextContent(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent(
      (children as { props: { children?: ReactNode } }).props.children
    );
  }
  return '';
}

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Markdown 渲染组件，自动识别围栏代码块并交给 CodeBlock 渲染，
 * 内联代码使用 .inline-code 样式，链接强制新窗口打开，表格外层加横向滚动容器
 */
export function Markdown({ content, className }: MarkdownProps) {
  const components = useMemo(
    () => ({
      code({
        className: codeClassName,
        children,
        ...props
      }: React.HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
        const match = /language-(\w+)/.exec(codeClassName || '');
        const isInline = !match;

        if (isInline) {
          return (
            <code className="inline-code" {...props}>
              {children}
            </code>
          );
        }

        const lang = match[1];
        const rawCode = getTextContent(children).replace(/\n$/, '');
        const codeElement = (
          <code className={codeClassName} {...props}>
            {children}
          </code>
        );

        return (
          <CodeBlock
            lang={lang}
            code={rawCode}
            highlightElement={codeElement}
          />
        );
      },
      a({
        href,
        children,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:text-blue-800 underline underline-offset-2"
            {...props}
          >
            {children}
          </a>
        );
      },
      table({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
        return (
          <div className="table-wrapper">
            <table {...props}>{children}</table>
          </div>
        );
      },
    }),
    []
  );

  return (
    <div className={cn('msg-content break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components as never}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
