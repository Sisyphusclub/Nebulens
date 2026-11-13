/** A box on the page, as `getBoundingClientRect` reports it. */
export interface PageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The rounded box the stars bend around, in CSS pixels from the canvas's top left corner. */
export interface StarfieldLens {
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  radius: number;
}

export interface StarfieldFrame {
  /** The canvas's size on the page, in CSS pixels. */
  width: number;
  height: number;
  /** The screen's device pixels per CSS pixel. */
  pixelRatio: number;
  /** The share of the usual sharpness to draw at, from 0 to 1. */
  quality: number;
  lens: StarfieldLens | null;
  /** How far the sky has slid, in CSS pixels: a larger shift moves the stars left and up. */
  shiftX: number;
  shiftY: number;
  /** Seconds of animation so far; drives the twinkle. */
  time: number;
}

export interface StarfieldRenderer {
  draw(frame: StarfieldFrame): void;
  /** Frees the program and hands the GPU context back; the canvas cannot be drawn to again. */
  dispose(): void;
}

/** Device pixels the canvas may hold: more than this costs frames on integrated graphics. */
const PIXEL_BUDGET = 4_000_000;
/** Past two device pixels per pixel the stars look no sharper. */
const SHARPEST = 2;

/**
 * Device pixels per CSS pixel to draw a canvas of this size with. `quality` below 1 draws
 * softer still, for a GPU that cannot keep up.
 */
export function bufferScale(
  width: number,
  height: number,
  pixelRatio: number,
  quality = 1,
): number {
  const wanted = Math.min(Math.max(pixelRatio, 1), SHARPEST);
  const affordable = Math.sqrt(PIXEL_BUDGET / Math.max(width * height, 1));
  return Math.min(wanted, affordable) * quality;
}

/** Where `target` sits inside `canvas`, as the lens the shader bends the stars around. */
export function lensWithin(
  canvas: PageBox,
  target: PageBox | null,
  radius: number,
): StarfieldLens | null {
  if (target === null || target.width <= 0 || target.height <= 0) return null;
  const halfWidth = target.width / 2;
  const halfHeight = target.height / 2;
  return {
    x: target.left - canvas.left + halfWidth,
    y: target.top - canvas.top + halfHeight,
    halfWidth,
    halfHeight,
    radius: Math.min(Math.max(radius, 0), halfWidth, halfHeight),
  };
}

/** Every uniform `draw` sets; the shader has to declare each one. */
export const STARFIELD_UNIFORMS = [
  'u_buffer',
  'u_scale',
  'u_lens',
  'u_radius',
  'u_shift',
  'u_time',
] as const;

type UniformName = (typeof STARFIELD_UNIFORMS)[number];

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * A night sky that bends around a rounded box, the way light bends around a heavy body.
 *
 * Each pixel near the box looks at a point of sky pulled towards the box, so the sky behind
 * the box is squeezed into a band around it and the stars there turn into thin streaks that
 * follow its outline. As the sky slides, they flow around the box instead of passing behind.
 * All lengths are CSS pixels.
 */
export const STARFIELD_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_buffer;
uniform float u_scale;
uniform vec4 u_lens;
uniform float u_radius;
uniform vec2 u_shift;
uniform float u_time;

// How far the sky is pulled at the box's edge, and the distance over which the pull falls
// to about a third. Their ratio is how much the sky is squeezed right at the edge.
const float PULL = 150.0;
const float REACH = 52.0;
// How much longer a star is drawn along the outline right at the edge, and how fast that
// fades. With the squeeze, this is what turns dots into streaks.
const float STRETCH = 3.6;
const float STRETCH_REACH = 40.0;
// The field bends around rounder corners than the box has, so the streaks sweep around
// its ends in arcs instead of turning on the spot.
const float FIELD_CORNER = 64.0;
// A star thinner than this many device pixels would flicker as it moves, so it dims instead.
const float THINNEST = 1.15;

const vec3 COOL = vec3(0.66, 0.79, 1.0);
const vec3 WARM = vec3(1.0, 0.86, 0.72);
const vec3 HALO = vec3(0.6, 0.72, 0.95);

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float roundedBox(vec2 p, vec2 halfSize, float corner) {
  vec2 q = abs(p) - halfSize + corner;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
}

// One depth of stars, one per cell of a grid. "at" is the point of sky this pixel looks at.
// A star is drawn "squeeze" times thinner across the outline ("normal") and "stretch" times
// longer along it.
vec3 starLayer(
  vec2 at, float cell, float seed, float smallest, float largest,
  vec2 normal, float squeeze, float stretch
) {
  vec2 first = floor(at / cell - 0.5);
  vec3 light = vec3(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = first + vec2(float(i), float(j));
      vec2 place = hash2(id + seed);
      vec2 look = hash2(id * 1.37 + seed + 19.19);
      vec2 away = at - (id + 0.08 + 0.84 * place) * cell;
      float size = mix(smallest, largest, look.x * look.x * look.x);
      float thin = max(size / squeeze, THINNEST / u_scale);
      float wide = max(size * stretch, THINNEST / u_scale);
      float across = dot(away, normal) / squeeze / thin;
      float along = dot(away, vec2(-normal.y, normal.x)) / wide;
      float r2 = across * across + along * along;
      if (r2 < 16.0) {
        vec2 mood = fract(look * vec2(57.13, 91.71) + place.yx * 13.7);
        // A star held at the thinnest width covers more than its share, so it dims a little.
        float dim = sqrt(size / squeeze / thin) * (size * stretch / wide);
        float bright = mix(0.38, 1.0, look.y) * (0.62 + 0.38 * look.x);
        float twinkle = 0.86 + 0.14 * sin(u_time * (0.5 + 1.6 * mood.x) + mood.y * 6.2832);
        // A crisp disc, with a faint glow around the larger stars.
        float glow = exp(-r2 * r2) + 0.22 * look.x * exp(-r2 * 0.4);
        vec3 tint = mood.y > 0.88 ? WARM : mix(vec3(1.0), COOL, mood.x);
        light += tint * (glow * bright * twinkle * dim);
      }
    }
  }
  return light;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_buffer.y - gl_FragCoord.y) / u_scale;

  vec2 sky = p;
  vec2 normal = vec2(0.0, 1.0);
  float squeeze = 1.0;
  float stretch = 1.0;
  float open = 1.0;
  vec3 light = vec3(0.0);

  if (u_lens.z > 0.0) {
    vec2 rel = p - u_lens.xy;
    vec2 halfSize = u_lens.zw;
    float edge = roundedBox(rel, halfSize, u_radius);

    float corner = min(max(u_radius, FIELD_CORNER), min(halfSize.x, halfSize.y));
    float field = max(roundedBox(rel, halfSize, corner), 0.0);
    // Outwards from the nearest point of that rounder outline.
    normal = sign(rel) * normalize(max(abs(rel) - halfSize + corner, 0.0) + 0.0001);

    float bend = exp(-field / REACH);
    sky = p - normal * (PULL * bend);
    squeeze = 1.0 + PULL / REACH * bend;
    stretch = 1.0 + STRETCH * exp(-field / STRETCH_REACH);

    // Nothing shows through the box itself; a haze and a thin bright rim hug its edge.
    open = smoothstep(-0.5, 1.0, edge);
    float outside = max(edge, 0.0);
    float haze = 0.085 * exp(-outside / 46.0) + 0.1 * exp(-outside / 11.0);
    float offRim = (edge - 0.7) / 0.9;
    float rim = 0.62 * exp(-offRim * offRim);
    light += HALO * haze * open + vec3(0.9, 0.95, 1.0) * rim;
  }

  vec3 stars =
    starLayer(sky + u_shift * 0.34, 40.0, 0.0, 0.55, 1.1, normal, squeeze, stretch) +
    starLayer(sky + u_shift * 0.6, 70.0, 37.0, 0.7, 1.6, normal, squeeze, stretch) +
    starLayer(sky + u_shift, 120.0, 91.0, 1.0, 2.4, normal, squeeze, stretch);
  light += stars * open;

  // Half a step of noise, so the faint haze does not settle into bands of 8-bit colour.
  light += (hash2(gl_FragCoord.xy).x - 0.5) / 255.0;
  light = clamp(light, 0.0, 1.0);
  // Light over the page: each pixel covers the page only as much as it shines.
  gl_FragColor = vec4(light, max(light.r, max(light.g, light.b)));
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, STARFIELD_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (vertex === null || fragment === null || program === null) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The program keeps what it needs of the shaders.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) === true) return program;
  gl.deleteProgram(program);
  return null;
}

/**
 * Sets the canvas up to draw the starfield, or returns null where it cannot: no WebGL, no
 * GPU behind it, no high-precision floats in fragment shaders, or a shader the driver
 * rejects. The page then keeps its plain background.
 */
export function createStarfieldRenderer(canvas: HTMLCanvasElement): StarfieldRenderer | null {
  if (typeof WebGLRenderingContext === 'undefined') return null;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    // No context at all on a software renderer: drawing the sky on the CPU every frame
    // would cost more than the sky is worth.
    failIfMajorPerformanceCaveat: true,
  });
  if (gl === null) return null;
  // Stars smaller than a pixel, thousands of pixels from the origin, need more than the
  // precision every device is guaranteed to have.
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (precision === null || precision.precision === 0) return null;
  const program = link(gl);
  if (program === null) return null;

  // One triangle that covers the whole canvas.
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name: UniformName): WebGLUniformLocation | null =>
    gl.getUniformLocation(program, name);
  const buffer = uniform('u_buffer');
  const scale = uniform('u_scale');
  const lens = uniform('u_lens');
  const radius = uniform('u_radius');
  const shift = uniform('u_shift');
  const time = uniform('u_time');

  return {
    draw(frame) {
      const density = bufferScale(frame.width, frame.height, frame.pixelRatio, frame.quality);
      const width = Math.max(1, Math.round(frame.width * density));
      const height = Math.max(1, Math.round(frame.height * density));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(buffer, width, height);
      gl.uniform1f(scale, density);
      gl.uniform4f(
        lens,
        frame.lens?.x ?? 0,
        frame.lens?.y ?? 0,
        frame.lens?.halfWidth ?? 0,
        frame.lens?.halfHeight ?? 0,
      );
      gl.uniform1f(radius, frame.lens?.radius ?? 0);
      gl.uniform2f(shift, frame.shiftX, frame.shiftY);
      gl.uniform1f(time, frame.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(corners);
      gl.deleteProgram(program);
      // Browsers keep only a handful of contexts alive; this one is given back now rather
      // than whenever the canvas happens to be collected.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
