import type { Config } from 'tailwindcss'

/**
 * MBFD Command theme — a dark fireground command-board palette.
 * Surfaces are deep navy/charcoal for outdoor contrast; apparatus accents
 * key off real fire-service convention (engines red, ladders amber, rescues
 * green/EMS, command blue, fireboats teal, special/detail violet).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Base surfaces (darkest -> lightest panel)
        ground: '#060912',
        surface: {
          DEFAULT: '#0b111f',
          raised: '#111a2c',
          high: '#18253c',
          line: '#243248',
        },
        ink: {
          DEFAULT: '#e8eef7',
          dim: '#9fb0c7',
          faint: '#65748d',
        },
        // Operational accents
        go: '#38bdf8', // command / interactive blue
        live: '#fb3b4e', // recording / active fireground red
        warn: '#f59e0b',
        ok: '#22c55e',
        // Apparatus type accents (used by unit cards + column tints)
        app: {
          engine: '#ef4444',
          ladder: '#f59e0b',
          rescue: '#22c55e',
          command: '#38bdf8',
          fireboat: '#2dd4bf',
          special: '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.7)',
        lift: '0 18px 40px -16px rgba(0,0,0,0.8)',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
