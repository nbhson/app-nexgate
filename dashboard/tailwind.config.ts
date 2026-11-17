/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dde7ff",
          200: "#c2d4ff",
          300: "#9bb6ff",
          400: "#6f8efc",
          500: "#4a66f5",
          600: "#3a4ad6",
          700: "#2f3ab0",
          800: "#26308a",
          900: "#1d2460",
        },
      },
    },
  },
  plugins: [],
};
