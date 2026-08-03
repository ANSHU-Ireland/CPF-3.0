/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--cpf-brand)',
          hover: 'var(--cpf-brand-hover)',
        },
        ink: {
          DEFAULT: 'var(--cpf-ink)',
          secondary: 'var(--cpf-text-secondary)',
        },
        surface: {
          DEFAULT: 'var(--cpf-surface)',
          subtle: 'var(--cpf-surface-subtle)',
        },
        'page-bg': 'var(--cpf-bg)',
        border: {
          DEFAULT: 'var(--cpf-border)',
        },
        status: {
          success: 'var(--cpf-success)',
          warning: 'var(--cpf-warning)',
          danger: 'var(--cpf-danger)',
          info: 'var(--cpf-info)',
        },
        focus: 'var(--cpf-focus)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
      },
      spacing: {
        '1.5': '0.375rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      maxWidth: {
        dashboard: '1440px',
        reading: '960px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(16, 42, 67, 0.08), 0 1px 2px 0 rgba(16, 42, 67, 0.06)',
        elevated: '0 4px 12px -2px rgba(16, 42, 67, 0.12), 0 2px 6px -1px rgba(16, 42, 67, 0.08)',
        drawer: '0 10px 30px -4px rgba(16, 42, 67, 0.2), 0 4px 12px -2px rgba(16, 42, 67, 0.12)',
      },
      animation: {
        'fade-in': 'cpf-fade-in 0.2s ease-out',
        'slide-up': 'cpf-slide-up 0.25s ease-out',
        'slide-in-right': 'cpf-slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'cpf-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'cpf-slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'cpf-slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
