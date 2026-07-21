/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Roboto', 'sans-serif'],
        body: ['Roboto', 'sans-serif'],
        data: ['Roboto Mono', 'monospace'],
      },
      colors: {
        // Palette mapped from ECLAT / Evolve RCM mockup CSS variables
        surface: '#f4f6f9', // --bg-page
        panel: '#ffffff', // --bg-white
        'panel-light': '#f8f9ff', // --bg-tint
        border: '#eaecf0', // --border
        'border-light': '#e5e7eb', // --border-soft
        accent: '#4f46e5', // --accent (indigo-600)
        'accent-hover': '#3b34cc', // --accent-hover
        'accent-dim': '#eef2ff', // --accent-soft
        'accent-grad': '#7c3aed', // --accent-grad-start (violet, gradient partner)
        cyan: '#7c3aed', // secondary / violet
        toolbar: '#25375c', // --toolbar-bg (dark navy bars)
        sidebar: '#10141d', // dark sidebar surface
        success: '#10b981',
        'success-dim': '#ecfdf5',
        warn: '#d97706',
        'warn-dim': '#fef3c7',
        danger: '#f43f5e',
        'danger-dim': '#fff1f2',
        muted: '#6b7280', // --text-secondary
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
