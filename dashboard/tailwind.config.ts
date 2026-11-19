import type { Config } from "tailwindcss";

/**
 * Design tokens — chuẩn enterprise dark theme (skill-color-theory:
 * dark-mode-palette + gray-ramp-neutrals + semantic-color-system).
 *
 * - Neutral (slate): navy-tinted theo brand hue; elevation bằng LIGHTNESS
 *   (page 950 → surface 900 → raised), không dùng #000.
 * - Brand: indigo đã hạ chroma ~25% cho dark; dark primary = step 500-600,
 *   brand TEXT dùng step 300-400 (re-binding light 600 → dark 400).
 * - Semantic (emerald/amber/red): ramp được desaturate cho dark, text ở
 *   step 300 (≥4.5:1 trên surface), filled button ở step 600-700 + trắng.
 *
 * Markup chỉ dùng alias (bg-surface, text-ink... khi cần) hoặc các ramp
 * trên — không hex lẻ trong component.
 */

const neutral = {
  50: "#f5f7fb",
  100: "#e8edf5", // text primary (~oklch 0.93, tránh halation)
  200: "#d2dae7",
  300: "#adbacf", // text phụ đậm
  400: "#8b99b1", // text secondary — 4.5:1+ trên surface/page
  500: "#6a7890", // tertiary / hint
  600: "#4b586d",
  700: "#2f3b4f", // border input (3:1 với surface)
  800: "#212b3c", // border card / divider
  900: "#151e2c", // surface — elevation 1
  950: "#0c121e", // page background — elevation 0
};

const brand = {
  50: "#eff3fe",
  100: "#dfe8fd",
  200: "#c2d2fb",
  300: "#97b0f5", // brand accent text trên dark
  400: "#6b86f2", // hover / focus ring
  500: "#4a67df", // brand fill (white text 5.0:1)
  600: "#3b54b8", // primary button base (white text 6.4:1)
  700: "#33469f",
  800: "#2b3878",
  900: "#263059",
};

/** success — desaturated green (bảo toàn quy ước hue) */
const success = {
  200: "#a5ddc1",
  300: "#78c8a0",
  400: "#54ad82",
  500: "#3a9168",
  600: "#2c7352",
  700: "#225940",
  950: "#0a1712",
};

/** warning — amber đọc tách biệt green/red (CVD-safe: luôn kèm text) */
const warning = {
  200: "#efdaa9",
  300: "#e2bd76",
  400: "#d1a34f",
  500: "#b9862f",
  600: "#94691f",
  700: "#6f4f17",
  950: "#1d1508",
};

/** danger — red trầm cho dark, không neon */
const danger = {
  100: "#f2d2d5",
  200: "#e9b2b8",
  300: "#dd8d95",
  400: "#cd6672",
  500: "#b34553",
  600: "#963543",
  700: "#7c2b38",
  800: "#5c2029",
  900: "#411519",
  950: "#1c0b0d",
};

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        slate: neutral,
        brand,
        emerald: success,
        amber: warning,
        red: danger,
        // alias semantic — component nên dùng tên vai trò
        surface: { DEFAULT: neutral[900], raised: "#1a2434", page: neutral[950] },
        ink: { primary: neutral[100], secondary: neutral[400], tertiary: neutral[500] },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        // dark mode: shadow chỉ là "whisper" — border + lightness mang chiều sâu
        card: "0 1px 2px rgba(0,0,0,0.35)",
        pop: "0 12px 32px rgba(2,6,16,0.55)",
      },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
    },
  },
  plugins: [],
} satisfies Config;
