/**
 * @file components/Markdown.tsx
 * @description Markdown 渲染组件，基于 react-markdown 封装自定义渲染器（代码块、链接、表格）
 */

import { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';
import { cn } from '../lib/utils';

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
 * Markdown 渲染组件，自动识别围栏代码块并交给 CodeBlock 渲染（含语言标签、复制、折叠），
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
