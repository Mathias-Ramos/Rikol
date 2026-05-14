import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#fff8eb",
        ink: "#1f2933",
        coral: "#ff7a7a",
        mango: "#ffc857",
        mint: "#59d8a1",
        sky: "#69b7ff",
        berry: "#8f65ff"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(31, 41, 51, 0.12)"
      },
      borderRadius: {
        app: "8px"
      }
    }
  },
  plugins: []
} satisfies Config;
