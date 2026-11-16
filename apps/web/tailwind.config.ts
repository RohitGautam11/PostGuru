import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'scale(0.97) translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        progress: { from: { width: '0%' }, to: { width: '100%' } },
      },
      animation: { 'fade-in': 'fade-in .22s cubic-bezier(0.16,1,0.3,1)', progress: 'progress 1.8s linear forwards' },
    },
  },
  plugins: [],
};

export default config;
