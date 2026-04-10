import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-syne)', 'sans-serif'],
        body:    ['var(--font-dm)',   'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#fdf8f2',
          100: '#faecd9',
          200: '#f3d5aa',
          300: '#eab870',
          400: '#df9a3e',
          500: '#c8873a',
          600: '#b06a28',
          700: '#8f5122',
          800: '#744223',
          900: '#5f371f',
        },
      },
    },
  },
  plugins: [],
}
export default config
