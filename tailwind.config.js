/** Tailwind configured with GitHub Primer's scales: 6px base radius, 4px spacing grid, system font stack. */
const token = name => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        'canvas-subtle': token('canvas-subtle'),
        'canvas-inset': token('canvas-inset'),
        line: token('line'),
        'line-muted': token('line-muted'),
        fg: token('fg'),
        'fg-muted': token('fg-muted'),
        'fg-subtle': token('fg-subtle'),
        accent: token('accent'),
        'accent-emphasis': token('accent-emphasis'),
        'accent-subtle': token('accent-subtle'),
        'accent-on-fg': token('accent-on-fg'),
        success: token('success'),
        'success-emphasis': token('success-emphasis'),
        'success-subtle': token('success-subtle'),
        'success-on-fg': token('success-on-fg'),
        danger: token('danger'),
        'danger-emphasis': token('danger-emphasis'),
        'danger-subtle': token('danger-subtle'),
        attention: token('attention'),
        'attention-subtle': token('attention-subtle'),
        done: token('done'),
        'done-subtle': token('done-subtle'),
        severe: token('severe'),
        'severe-subtle': token('severe-subtle')
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '6px',
        md: '6px',
        lg: '12px'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans"', 'Helvetica', 'Arial', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace']
      },
      fontSize: {
        xs: ['12px', '18px'],
        sm: ['14px', '20px'],
        base: ['16px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['32px', '40px']
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
        resting: 'var(--shadow-resting)'
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } }
      }
    }
  },
  plugins: []
};
