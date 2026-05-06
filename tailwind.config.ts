import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'iris-void': '#030303',
        'iris-dark': '#050505',
        'iris-emerald': '#10b981',
        'iris-green': '#34d399',
        'iris-cyan': '#06b6d4',
        'iris-text': '#f5f5f5',
        'iris-muted': '#a1a1a1',
        'iris-error': '#ef4444',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'iris-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'iris-glow': 'glow 3s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #10b981, 0 0 10px #10b981' },
          '100%': { boxShadow: '0 0 20px #10b981, 0 0 40px #10b981' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
