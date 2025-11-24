const withOpacity = (variable) => {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variable}) / ${opacityValue})`;
    }

    return `rgb(var(${variable}) / 1)`;
  };
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'wa-primary': withOpacity('--wa-primary'),
        'wa-primary-dark': withOpacity('--wa-primary-dark'),
        'wa-bg': withOpacity('--wa-bg'),
        'wa-panel': withOpacity('--wa-panel'),
        'wa-panel-header': withOpacity('--wa-panel-header'),
        'wa-panel-header-icon': withOpacity('--wa-panel-header-icon'),
        'wa-bubble-out': withOpacity('--wa-bubble-out'),
        'wa-bubble-in': withOpacity('--wa-bubble-in'),
        'wa-text-primary': withOpacity('--wa-text-primary'),
        'wa-text-secondary': withOpacity('--wa-text-secondary'),
        'wa-border': withOpacity('--wa-border'),
        'wa-icon': withOpacity('--wa-icon'),
        'wa-link': withOpacity('--wa-link'),
        'wa-system-green': withOpacity('--wa-system-green'),
        'wa-system-red': withOpacity('--wa-system-red'),
        'wa-list-hover': withOpacity('--wa-list-hover'),
        'wa-list-active': withOpacity('--wa-list-active'),
        'wa-chip-bg': withOpacity('--wa-chip-bg'),
        'wa-bubble-meta': withOpacity('--wa-bubble-meta'),
        'wa-badge-text': withOpacity('--wa-badge-text'),
        'wa-chat-bg': withOpacity('--wa-chat-bg'),
      }
    },
  },
  plugins: [],
}
