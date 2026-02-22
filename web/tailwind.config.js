/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts,scss}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: '#2d3250',
        graphite: '#424769',
        softblue: '#d5dbf0',
        accent: '#f9b17a',
        white: '#ffffff',
      },
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
      },
      boxShadow: {
        air: '0 10px 30px rgba(0, 0, 0, 0.1)',
        glow: '0 0 20px rgba(249, 177, 122, 0.4)',
      },
      container: {
        center: true,
        padding: '1.5rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
