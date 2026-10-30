import type { Confidence } from "./data";

type RGB = [number, number, number];

/** Point colours by flash-flood confidence. Hue carries confidence; size never encodes impact. */
export const CONFIDENCE_COLOR: Record<Confidence, RGB> = {
  High: [76, 201, 240],
  Medium: [244, 162, 97],
  Low: [167, 155, 196],
};
export const UNKNOWN_COLOR: RGB = [150, 150, 150];

/** Neutral haze for location uncertainty, deliberately unlike any point colour. */
export const UNCERTAINTY_COLOR: RGB = [226, 232, 240];

export const cssRgb = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;

export const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const METERS_PER_DEGREE = 111_320;
