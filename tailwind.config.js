/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: { bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8' },
        light: { bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', text: '#1e293b', muted: '#64748b' },
        accent: { DEFAULT: '#3b82f6', hover: '#2563eb' },
        positive: { DEFAULT: '#22c55e', light: '#16a34a' },
        negative: { DEFAULT: '#ef4444', light: '#dc2626' },
        warning: { DEFAULT: '#f59e0b', light: '#d97706' },
      },
      animation: { shimmer: 'shimmer 1.5s infinite', 'pulse-slow': 'pulse 2s infinite' },
      keyframes: { shimmer: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } } },
    },
  },
  plugins: [],
}
