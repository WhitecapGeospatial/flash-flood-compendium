import { ScatterplotLayer } from "@deck.gl/layers";

/**
 * A ScatterplotLayer whose stroke is dashed. Used for location uncertainty:
 * a light translucent disc with a dashed edge reads as "somewhere in here",
 * not as a measured flood footprint.
 *
 * Injected at the end of main(), where the layer's varyings are in scope:
 * unitPosition is the fragment's position in the unit circle, outerRadiusPixels
 * the on-screen radius and innerUnitRadius where the stroke starts.
 */
const DASH_PX = 5.0;
const GAP_PX = 4.0;

export class DashedCircleLayer<D> extends ScatterplotLayer<D> {
  static layerName = "DashedCircleLayer";

  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        "fs:#main-end": `
          float r = length(unitPosition) * outerRadiusPixels;
          if (r > innerUnitRadius * outerRadiusPixels) {
            float arc = (atan(unitPosition.y, unitPosition.x) + 3.14159265) * r;
            if (mod(arc, ${(DASH_PX + GAP_PX).toFixed(1)}) > ${DASH_PX.toFixed(1)}) discard;
          }
        `,
      },
    };
  }
}
