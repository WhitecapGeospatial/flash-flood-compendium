import { useEffect, useState } from "react";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

export type Scheme = "light" | "dark";

/** Every event and location is the same red; confidence is shown in text, not colour. */
export const EVENT_COLOR: RGB = [220, 38, 38];

/** Map colours that must contrast with the basemap. */
export const MAP_THEME: Record<
  Scheme,
  { basemap: string; uncertaintyFill: RGBA; uncertaintyLine: RGBA; link: RGBA }
> = {
  light: {
    basemap: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    uncertaintyFill: [255, 255, 255, 150],
    uncertaintyLine: [55, 65, 81, 230],
    link: [55, 65, 81, 150],
  },
  dark: {
    basemap: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    uncertaintyFill: [255, 255, 255, 45],
    uncertaintyLine: [255, 255, 255, 210],
    link: [255, 255, 255, 120],
  },
};

export const cssRgb = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;

export const METERS_PER_DEGREE = 111_320;

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Follows the OS light/dark setting; light when the system states no preference. */
export function useColorScheme(): Scheme {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark ? "dark" : "light";
}
