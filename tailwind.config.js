const tokens = require('./tailwind.tokens.js');
/** @type {import('tailwindcss').Config} */
module.exports = {
  ...tokens,
  content: ['./src/**/*.{ts,tsx}', './demo/**/*.{ts,tsx,html}'],
  theme: { ...tokens.theme, extend: { ...tokens.theme.extend } },
  plugins: [],
};
