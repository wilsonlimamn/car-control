/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '.dark'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        accent: ({ opacityValue }) => {
          if (opacityValue !== undefined) {
            return `rgba(var(--accent-rgb), ${opacityValue})`;
          }
          return 'var(--accent)';
        },
      },
      opacity: {
        18: '0.18',
        25: '0.25',
      },
      scale: {
        98: '.98',
      },
    },
  },
  plugins: [],
};
