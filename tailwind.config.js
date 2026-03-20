/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f0f0f',
        panel: '#1a1a1a',
        border: '#2a2a2a',
      },
    },
  },
  plugins: [],
}
