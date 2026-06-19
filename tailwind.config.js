/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        royalBlue: {
          DEFAULT: '#002060', // Azul Royal da Ótica Luz
          light: '#1e40af',
        },
        gold: {
          DEFAULT: '#D4AF37', // Dourado Metálico
          light: '#F3E5AB',
          dark: '#AA7C11',
        },
        wood: {
          light: '#D7CCC8',   // Tons amadeirados para o design
          DEFAULT: '#8D6E63',
          dark: '#4E342E',
        },
      },
    },
  },
  plugins: [],
}