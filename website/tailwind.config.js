import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['SF Mono', 'Fira Code', 'Fira Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      // 语义层字号类映射到 styles.css 数值层的 CSS 变量，写字号一律用语义类。
      fontSize: {
        micro: ['var(--text-11)', { lineHeight: 'var(--text-11-line-height)' }],
        caption: ['var(--text-12)', { lineHeight: 'var(--text-12-line-height)' }],
        body: ['var(--text-13)', { lineHeight: 'var(--text-13-line-height)' }],
        content: ['var(--text-14)', { lineHeight: 'var(--text-14-line-height)' }],
        nav: ['var(--text-15)', { lineHeight: 'var(--text-15-line-height)' }],
        lead: ['var(--text-16)', { lineHeight: 'var(--text-16-line-height)' }],
        'content-lg': ['var(--text-18)', { lineHeight: 'var(--text-18-line-height)' }],
        'title-page': ['var(--text-20)', { lineHeight: 'var(--text-20-line-height)' }],
        'section-title': ['var(--text-24)', { lineHeight: 'var(--text-24-line-height)' }],
        'title-display': ['var(--text-30)', { lineHeight: 'var(--text-30-line-height)' }],
        'hero-title': ['var(--text-36)', { lineHeight: 'var(--text-36-line-height)' }],
        'hero-title-lg': ['var(--text-48)', { lineHeight: 'var(--text-48-line-height)' }],
      },
      colors: {
        ink: {
          DEFAULT: '#0a0a0a',
          soft: '#404040',
          faint: '#737373',
        },
        paper: {
          DEFAULT: '#ffffff',
          tint: '#fafafa',
          line: '#e5e5e5',
        },
        demo: {
          primary: '#2c7fdd',
          'primary-fg': '#f0f6fe',
          muted: '#f5f5f5',
          'muted-fg': '#787878',
          border: '#e8e8e8',
          fg: '#0b0f19',
          placeholder: '#c9c9c9',
        },
      },
      transitionTimingFunction: {
        'emil-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'emil-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
    },
  },
  plugins: [typography],
};
