/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aqi: {
          good: '#10b981',
          moderate: '#fbbf24',
          unhealthy: '#f97316',
          vunhealthy: '#ef4444',
          hazardous: '#7f1d1d',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.1)',
          dark: 'rgba(15, 23, 42, 0.3)',
        }
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'neumorph-light': '5px 5px 10px #d1d5db, -5px -5px 10px #ffffff',
        'neumorph-dark': '5px 5px 10px #020617, -5px -5px 10px #1e293b',
      }
    },
  },
  plugins: [],
  darkMode: 'class',
}
