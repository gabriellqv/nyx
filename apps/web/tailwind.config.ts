import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--nyx-background)',
        foreground: 'var(--nyx-text)',
        nyx: {
          background: '#100F1D',
          sidebar: '#151527',
          card: '#191B35',
          primary: '#7963B5',
          'primary-hover': '#8B74CC',
          highlight: '#B8A5E8',
          text: '#E5E0F0',
          muted: '#9291AA',
          border: '#302C45',
        },
      },
    },
  },
  plugins: [],
};

export default config;
