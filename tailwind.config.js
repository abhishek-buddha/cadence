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
        // Neutral light-gray page background, with blue reserved as the
        // accent color only (buttons, links, active states, toolbar).
        surface: '#f5f6f8', // --bg-page
        panel: '#ffffff', // --bg-white
        'panel-light': '#eef0f2', // --bg-hover
        border: '#dde0e4', // --border
        'border-light': '#e8eaed', // --border-soft
        accent: '#2c93d8', // --accent
        'accent-hover': '#1f7cbb', // --accent-hover
        'accent-dim': '#e3f2fc', // --accent-soft
        'accent-grad': '#63b8e8', // --accent-grad-start (gradient partner)
        cyan: '#0891b2', // secondary status color — kept a true teal so it stays
        // visually distinct from the new blue accent (mock has no equivalent role)
        toolbar: '#1c4f73', // --toolbar-bg (dark navy action-toolbar bars)
        'table-header': '#c3e3f6', // --table-header (colored table head band)
        'table-header-hover': '#a5d5f0', // --table-header-hover
        'table-header-text': '#10141d', // header cell text (dark navy, not accent)
        sidebar: '#10141d', // dark sidebar surface — unused placeholder
        success: '#10b981',
        'success-dim': '#ecfdf5',
        warn: '#d97706',
        'warn-dim': '#fef3c7',
        danger: '#f43f5e',
        'danger-dim': '#fff1f2',
        muted: '#5482a0', // --text-secondary
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
