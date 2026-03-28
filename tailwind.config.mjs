/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0d0d0d',
        'bg-surface': '#1a1a1a',
        'accent-yellow': '#f5e642',
        'accent-green': '#39ff14',
        'text-primary': '#e8e8e8',
        'text-muted': '#6b6b6b',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            color: '#e8e8e8',
            a: { color: '#f5e642' },
            h1: { color: '#f5e642' },
            h2: { color: '#f5e642' },
            h3: { color: '#39ff14' },
            h4: { color: '#39ff14' },
            code: { color: '#39ff14', backgroundColor: '#1a1a1a' },
            blockquote: { borderLeftColor: '#f5e642', color: '#6b6b6b' },
            strong: { color: '#e8e8e8' },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
