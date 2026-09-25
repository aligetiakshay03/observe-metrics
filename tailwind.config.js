/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: "var(--panel)",
        background: "var(--bg)",
      },
    },
  },
  plugins: [],
};
