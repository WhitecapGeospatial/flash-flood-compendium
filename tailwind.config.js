// @whitecapgeospatial/ui styles itself only through the classes this preset
// generates. Tailwind v4 has no `presets` key in CSS, but its v3-config compat
// layer honours one, so src/index.css loads this file with `@config`.
// `content` lists the package dist because v4 source detection skips node_modules.
import tokensPreset from "@whitecapgeospatial/tokens/tailwind.preset.js";

export default {
  presets: [tokensPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./node_modules/@whitecapgeospatial/ui/dist/**/*.js"],
};
