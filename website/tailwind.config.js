/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['SF Mono', 'Fira Code', 'Menlo', 'Consolas', 'monospace'],
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
      },
      transitionTimingFunction: {
        'emil-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'emil-in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
    },
  },
  plugins: [],
};
