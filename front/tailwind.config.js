/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'SF Pro Text'",
          "'SF Pro Display'",
          "'PingFang SC'",
          "'Hiragino Sans GB'",
          "'Microsoft YaHei'",
          "sans-serif",
        ],
        mono: [
          "'SF Mono'",
          "Menlo",
          "Monaco",
          "Consolas",
          "'Liberation Mono'",
          "'Courier New'",
          "monospace",
        ],
      },
      colors: {
        // Apple HIG System Colors
        hig: {
          blue: "#007AFF",
          green: "#34C759",
          indigo: "#5856D6",
          orange: "#FF9500",
          pink: "#FF2D55",
          purple: "#AF52DE",
          red: "#FF3B30",
          teal: "#5AC8FA",
          yellow: "#FFCC00",
          gray: {
            50: "#F9F9FB",
            100: "#F2F2F7",
            200: "#E5E5EA",
            300: "#D1D1D6",
            400: "#C7C7CC",
            500: "#AEAEB2",
            600: "#8E8E93",
            700: "#636366",
            800: "#48484A",
            900: "#1C1C1E",
          },
          bg: "#F5F5F7",
          card: "#FFFFFF",
          surface: "rgba(255, 255, 255, 0.8)",
          subtle: "rgba(0, 0, 0, 0.04)",
          border: "rgba(0, 0, 0, 0.08)",
        },
      },
      borderRadius: {
        'hig-xs': '6px',
        'hig-sm': '8px',
        'hig': '10px',
        'hig-md': '12px',
        'hig-lg': '16px',
        'hig-xl': '20px',
        'hig-2xl': '24px',
      },
      boxShadow: {
        'hig-sm': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'hig': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'hig-md': '0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.03)',
        'hig-lg': '0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
        'hig-float': '0 20px 48px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)',
      },
      backdropBlur: {
        'hig': '20px',
      },
    },
  },
  plugins: [],
};
