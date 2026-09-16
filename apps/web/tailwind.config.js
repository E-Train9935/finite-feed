/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        hyper: '0 20px 80px rgba(34, 211, 238, 0.08)',
      },
    },
  },
  plugins: [],
};
