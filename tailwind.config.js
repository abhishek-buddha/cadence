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
        // Palette mapped from the "Sky Blue" theme (grad-sky) in the ECLAT /
        // Evolve RCM theme-switcher mockup — see `list view themes 3.html`.
        surface: '#f2f9fe', // --bg-page
        panel: '#ffffff', // --bg-white
        'panel-light': '#e8f4fd', // --bg-hover
        border: '#d7ecfa', // --border
        'border-light': '#c5e3f7', // --border-soft
        accent: '#2c93d8', // --accent
        'accent-hover': '#1f7cbb', // --accent-hover
        'accent-dim': '#e3f2fc', // --accent-soft
        'accent-grad': '#63b8e8', // --accent-grad-start (gradient partner)
        cyan: '#0891b2', // secondary status color — kept a true teal so it stays
        // visually distinct from the new blue accent (mock has no equivalent role)
        toolbar: '#1c4f73', // --toolbar-bg (dark navy bars) — not yet used in any real UI
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
