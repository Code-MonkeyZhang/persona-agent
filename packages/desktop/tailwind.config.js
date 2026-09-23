/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        'general-bg': 'hsl(var(--general-bg))',
        placeholder: 'hsl(var(--placeholder))',
        'card-bg': 'hsl(var(--card-bg))',
        'card-border': 'hsl(var(--card-border))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        pop: 'var(--shadow-pop)',
      },
      fontFamily: {
        sans: ['var(--font-family-sans)'],
        mono: ['var(--font-family-mono)'],
      },
      fontSize: {
        micro: ['var(--font-micro)', { lineHeight: 'var(--text-11-line-height)' }],
        caption: ['var(--font-caption)', { lineHeight: 'var(--text-12-line-height)' }],
        body: ['var(--font-body)', { lineHeight: 'var(--text-13-line-height)' }],
        'body-strong': ['var(--font-body-strong)', { lineHeight: 'var(--text-13-line-height)' }],
        content: ['var(--font-content)', { lineHeight: 'var(--text-14-line-height)' }],
        'title-section': ['var(--font-title-section)', { lineHeight: 'var(--text-16-line-height)' }],
        'title-page': ['var(--font-title-page)', { lineHeight: 'var(--text-20-line-height)' }],
        'title-display': ['var(--font-title-display)', { lineHeight: 'var(--text-26-line-height)' }],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
