import { ScatterplotLayer } from "@deck.gl/layers";

/**
 * A ScatterplotLayer whose fill fades from the centre to fully transparent at
 * the radius. Used for location uncertainty: no hard edge, so it reads as "the
 * event is somewhere in here" rather than as an impact footprint.
 *
 * Injected at the end of main(), where the layer's varyings are in scope:
 * unitPosition is the fragment's position in the unit circle (length 1 = radius)
 * and outerRadiusPixels is the on-screen radius.
 */
export class FadeCircleLayer<D> extends ScatterplotLayer<D> {
  static layerName = "FadeCircleLayer";

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        "fs:#main-end": `
          float d = clamp(length(unitPosition), 0.0, 1.0);
          // Gaussian-like falloff: densest at the recorded point, ~0 at the radius.
          fragColor.a *= exp(-3.2 * d * d) * (1.0 - smoothstep(0.82, 1.0, d));
          // Zoomed far inside a large circle the haze would wash out the whole
          // view, so it thins once its radius passes ~1.5 screen widths.
          fragColor.a *= clamp(2400.0 / max(outerRadiusPixels, 1.0), 0.0, 1.0);
        `,
      },
    };
  }
}
