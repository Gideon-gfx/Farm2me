/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1E5631",
        "primary-dark": "#16401F",
        accent: "#FFB800",
        muted: "#6C757D",
      },
    },
  },
  plugins: [],
};
