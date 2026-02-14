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
        surface: '#f0f4f8',
        panel: '#ffffff',
        'panel-light': '#f1f5f9',
        border: '#e2e8f0',
        'border-light': '#cbd5e1',
        accent: '#2563eb',
        'accent-hover': '#1d4ed8',
        'accent-dim': '#dbeafe',
        cyan: '#0891b2',
        success: '#059669',
        'success-dim': '#d1fae5',
        warn: '#d97706',
        'warn-dim': '#fef3c7',
        danger: '#dc2626',
        'danger-dim': '#fee2e2',
        muted: '#64748b',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
