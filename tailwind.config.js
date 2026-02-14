/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
        data: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: '#0a0f1e',
        panel: '#111827',
        'panel-light': '#1f2937',
        border: '#1f2937',
        'border-light': '#374151',
        accent: '#3b82f6',
        'accent-hover': '#2563eb',
        'accent-dim': '#1e3a5f',
        cyan: '#06b6d4',
        success: '#10b981',
        'success-dim': '#064e3b',
        warn: '#f59e0b',
        'warn-dim': '#78350f',
        danger: '#ef4444',
        'danger-dim': '#7f1d1d',
        muted: '#6b7280',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
