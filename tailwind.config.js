/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f8ff',
          100: '#e6edff',
          200: '#c3d2ff',
          300: '#99b2ff',
          400: '#6f90ff',
          500: '#4b72ff',
          600: '#3459e6',
          700: '#2a47b4',
          800: '#223a8f',
          900: '#1d316f',
        },
      },
      screens: {
        'xs': '360px',
        '2xl': '1536px',
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1rem',
          md: '1.5rem',
          lg: '2rem',
          xl: '2.5rem',
        },
      },
      fontSize: {
        'fluid-sm': 'clamp(0.875rem, 0.85rem + 0.25vw, 1rem)',
        'fluid-base': 'clamp(1rem, 0.9rem + 0.5vw, 1.125rem)',
        'fluid-lg': 'clamp(1.125rem, 1rem + 0.75vw, 1.25rem)',
        'fluid-xl': 'clamp(1.25rem, 1.1rem + 1vw, 1.5rem)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/container-queries'),
    require('@tailwindcss/typography'),
  ],
}

