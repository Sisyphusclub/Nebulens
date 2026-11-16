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
  /**
   * Where the camera looks, in CSS pixels from the canvas's top left corner; the middle of
   * the canvas when absent. A page that keeps it fixed can let the canvas grow or shrink
   * without any star moving.
   */
  center?: { x: number; y: number };
  /** How far the camera has swung round the sky, in radians: to the right, and downwards. */
  yaw: number;
  pitch: number;
}

export interface StarfieldRenderer {
  draw(frame: StarfieldFrame): void;
  /** Frees the program and hands the GPU context back; the canvas cannot be drawn to again. */
  dispose(): void;
}

type Vector = [number, number, number];

/** Where the camera stands and how its screen lies: x to the right, y down, z out of it. */
export interface StarfieldCamera {
  eye: Vector;
  right: Vector;
  down: Vector;
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

/**
 * The camera after swinging `yaw` to the right and `pitch` downwards around the middle of
 * the sky. It stays one unit away and keeps looking at the middle, so stars in front of the
 * middle slide one way across the screen and stars behind it the other.
 */
export function orbitCamera(yaw: number, pitch: number): StarfieldCamera {
  const eye: Vector = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  // It looks along -eye. Its right is level with the horizon, and its down completes the set.
  const level = Math.hypot(eye[0], eye[2]);
  const right: Vector = [eye[2] / level, 0, -eye[0] / level];
  const down: Vector = [
    right[2] * eye[1],
    right[0] * eye[2] - right[2] * eye[0],
    -right[0] * eye[1],
  ];
  // A plain zero rather than a negative one, where a component cancels out.
  const tidy = (vector: Vector): Vector => [vector[0] + 0, vector[1] + 0, vector[2] + 0];
  return { eye: tidy(eye), right: tidy(right), down: tidy(down) };
}

/** Every uniform `draw` sets; the shader has to declare each one. */
export const STARFIELD_UNIFORMS = [
  'u_buffer',
  'u_scale',
  'u_lens',
  'u_radius',
  'u_center',
  'u_eye',
  'u_right',
  'u_down',
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
 * The sky is four sheets of stars at different depths, seen by a camera that swings round
 * their middle: the sheets in front slide one way and the ones behind the other, so the
 * stars have depth when the camera moves.
 *
 * The box draws the sky in: each pixel near it shows the sky that lies further out, so the
 * sky nearest the box is squeezed into a band along its edge. The pull follows a stadium
 * round the box: along the long sides the band is thin and the stars there thin into short
 * streaks; round the ends it is deep, and the stars swirl round them in long arcs. Behind
 * the box the sky is enlarged a little instead: the box is thick glass, and the stars show
 * through it larger and fewer. All lengths are CSS pixels.
 */
export const STARFIELD_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_buffer;
uniform float u_scale;
uniform vec4 u_lens;
uniform float u_radius;
uniform vec2 u_center;
uniform vec3 u_eye;
uniform vec3 u_right;
uniform vec3 u_down;

// A pixel d pixels from the box's edge shows the sky PULL * REACH * (1 - (1 - d / REACH)^STEEP)
// pixels further out, so the band is squeezed 1 + PULL * STEEP times over at the edge.
// Along the long sides the band is thin and tight; round the ends it is deep and looser,
// and that is where the sky swirls.
const float SIDE_REACH = 84.0;
const float END_REACH = 190.0;
const float SIDE_PULL = 1.25;
const float END_PULL = 0.8;
const float STEEP = 2.2;
// The long sides curve into the ends over about this many pixels, so the streaks turn
// gradually instead of at a corner.
const float EASE_IN = 110.0;
// Round the ends the streaks are drawn out up to 1 + ARC times longer, into arcs.
const float ARC = 2.4;
// The distance from the camera to the screen, which sets how wide its view is.
const float FOCAL = 1000.0;
// A star thinner than this many device pixels would flicker as it moves, so it dims instead.
const float THINNEST = 1.15;
// Behind the box the sky is seen this many times larger, about its middle. The page lays
// its glass over the box and softens what is behind it, so stars of the usual size would be
// lost there.
const float MAGNIFY = 1.6;

const vec3 COOL = vec3(0.68, 0.8, 1.0);
const vec3 WARM = vec3(1.0, 0.86, 0.72);
const vec3 HAZE = vec3(0.62, 0.72, 0.92);

vec2 hash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float roundedBox(vec2 p, vec2 halfSize, float corner) {
  vec2 q = abs(p) - halfSize + corner;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
}

// Smooth noise from 0 to 1, for the grain in the rim.
float grain(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(cell).x;
  float b = hash2(cell + vec2(1.0, 0.0)).x;
  float c = hash2(cell + vec2(0.0, 1.0)).x;
  float d = hash2(cell + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// One sheet of stars, one star to a cell. "depth" is how far the sheet stands in front of
// the middle of the sky (behind it when negative), as a share of its distance from the
// camera. "normal" points away from the box: a star is drawn "squeeze" times thinner along
// it and "smear" times longer across it. "fan" is how many times wider the sky is than the
// screen across that direction, where it fans out round an end of the box.
vec3 starSheet(
  vec2 seen, float depth, float cell, float seed, float smallest, float largest,
  float dimmest, float brightest, vec2 normal, float squeeze, float smear, float fan
) {
  // Where the line of sight through this pixel meets the sheet, in the sheet's own pixels.
  vec3 ray = -u_eye * FOCAL + u_right * seen.x + u_down * seen.y;
  // On a very wide canvas a line of sight at the far side could run along the sheet.
  ray.z = min(ray.z, -0.2 * FOCAL);
  float plane = depth / (1.0 + depth);
  vec2 at = (u_eye.xy + ray.xy * ((plane - u_eye.z) / ray.z)) * (FOCAL * (1.0 + depth));

  vec2 first = floor(at / cell - 0.5);
  vec3 light = vec3(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = first + vec2(float(i), float(j));
      vec2 place = hash2(id + seed);
      vec2 look = hash2(id * 1.37 + seed + 19.19);
      vec2 away = at - (id + 0.08 + 0.84 * place) * cell;
      float size = mix(smallest, largest, look.x * look.x);
      // The brighter the star, the longer its streak. Its length is counted in the sky, where
      // it is "fan" times longer than on the screen, and stops short of the next cell.
      float longer = 1.0 + (smear - 1.0) * (0.6 + 0.8 * look.y * look.y);
      float wide = min(max(size * longer, THINNEST / u_scale) * fan, cell * 0.16);
      float thin = max(size / squeeze, THINNEST / u_scale);
      float across = dot(away, normal) / squeeze / thin;
      float along = dot(away, vec2(-normal.y, normal.x)) / wide;
      float r2 = across * across + along * along;
      if (r2 < 16.0) {
        vec2 mood = fract(look * vec2(57.13, 91.71) + place.yx * 13.7);
        // Squeezed light is a little brighter.
        float bright =
          mix(dimmest, brightest, look.y * look.y) * (0.6 + 0.4 * look.x) *
          (1.0 + 0.1 * (squeeze - 1.0));
        // A sharp core with soft wings, so the brighter stars glow.
        float shine = 1.0 / pow(1.0 + r2, 2.75);
        vec3 tint = mood.y > 0.9 ? WARM : mix(vec3(1.0), COOL, mood.x * mood.x);
        light += tint * (shine * bright);
      }
    }
  }
  return light;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_buffer.y - gl_FragCoord.y) / u_scale;

  vec2 seen = p;
  vec2 normal = vec2(0.0, 1.0);
  float squeeze = 1.0;
  float smear = 1.0;
  float fan = 1.0;
  vec3 light = vec3(0.0);

  if (u_lens.z > 0.0) {
    vec2 rel = p - u_lens.xy;
    vec2 halfSize = u_lens.zw;
    float edge = roundedBox(rel, halfSize, u_radius);
    float outside = max(edge, 0.0);
    // 0 behind the box, 1 beside it.
    float beside = smoothstep(-0.5, 1.0, edge);

    if (edge > 0.0) {
      // Work with the long sides along x, in the first quadrant.
      bool tall = halfSize.y > halfSize.x;
      vec2 a = tall ? rel.yx : rel;
      vec2 h = tall ? halfSize.yx : halfSize;
      // Outwards from the box's spine, the segment its long sides run along: straight out
      // from the long sides, round from the ends. The spine's ends are rounded off over
      // EASE_IN, so the one turns smoothly into the other.
      float spineEnd = h.x - h.y;
      float along = abs(a.x);
      float soft = max(EASE_IN - abs(along - spineEnd), 0.0) / EASE_IN;
      float spine = min(along, spineEnd) - soft * soft * EASE_IN * 0.25;
      vec2 fromSpine = vec2(along - spine, abs(a.y));
      float dist = length(fromSpine) + 0.0001;
      vec2 outward = fromSpine / dist;
      // How sharply the field lines curve here: not at all beside the long sides, as round
      // as their distance from the spine's end beyond it.
      float turning = along < spineEnd ? soft * 0.5 : 1.0 - soft * 0.5;
      float curve =
        (turning * fromSpine.y * fromSpine.y + fromSpine.x * fromSpine.x) / (dist * dist * dist);
      vec2 oriented = vec2(a.x < 0.0 ? -outward.x : outward.x, a.y < 0.0 ? -outward.y : outward.y);
      normal = tall ? oriented.yx : oriented;
      // 0 beside the long sides, 1 straight off an end.
      float endward = outward.x * outward.x;

      float reach = mix(SIDE_REACH, END_REACH, endward);
      float share = mix(SIDE_PULL, END_PULL, endward);
      float fall = clamp(1.0 - outside / reach, 0.0, 1.0);
      float pulled = share * reach * (1.0 - pow(fall, STEEP));
      seen = p + normal * pulled;
      // How many times over the sky is squeezed here: the slope of the pull.
      squeeze = 1.0 + share * STEEP * pow(fall, STEEP - 1.0);
      // Round an end the sky also comes from a wider arc than the one it is shown on.
      fan = 1.0 + pulled * curve;
      // Squeezed stars draw out along the outline; round the ends, into long arcs.
      smear =
        (1.0 + 0.5 * (squeeze - 1.0) + 0.6 * exp(-outside / 6.0)) *
        (1.0 + ARC * endward * fall);
    } else {
      seen = u_lens.xy + rel / MAGNIFY;
    }

    // A fine rim of light runs along the box's edge, a little uneven and brighter along the
    // top, like light on a polished edge; a soft glow and a faint haze fade away from it on
    // the outside.
    float haze = 0.1 * exp(-outside / 30.0) + 0.15 * exp(-outside / 7.0);
    float glint = (0.8 + 0.4 * grain(p * 0.045)) * (1.0 - 0.22 * normal.y);
    float rim = 0.62 * glint * exp(-outside / 1.2) * smoothstep(-1.2, 0.0, edge);
    light += HAZE * haze * beside + vec3(0.9, 0.94, 1.0) * rim;
  }

  // The camera looks at u_center, which the page keeps still while the canvas changes size.
  seen -= u_center;
  vec3 stars =
    starSheet(seen, -0.3, 40.0, 0.0, 0.75, 1.4, 0.45, 1.15, normal, squeeze, smear, fan) +
    starSheet(seen, -0.12, 60.0, 37.0, 0.85, 1.75, 0.55, 1.3, normal, squeeze, smear, fan) +
    starSheet(seen, 0.18, 100.0, 91.0, 1.05, 2.4, 0.65, 1.6, normal, squeeze, smear, fan) +
    starSheet(seen, 0.42, 190.0, 53.0, 1.4, 3.3, 0.95, 2.1, normal, squeeze, smear, fan);
  light += stars;

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
    // No context at all on a software renderer: drawing the sky on the CPU would cost more
    // than the sky is worth.
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
  const center = uniform('u_center');
  const eye = uniform('u_eye');
  const right = uniform('u_right');
  const down = uniform('u_down');

  return {
    draw(frame) {
      const density = bufferScale(frame.width, frame.height, frame.pixelRatio, frame.quality);
      const width = Math.max(1, Math.round(frame.width * density));
      const height = Math.max(1, Math.round(frame.height * density));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      // Sized on the page in pixels rather than stretched to its box, so until this frame is
      // up a canvas whose box changed shows the old frame as it was, not squashed.
      const shownWidth = `${frame.width}px`;
      const shownHeight = `${frame.height}px`;
      if (canvas.style.width !== shownWidth) canvas.style.width = shownWidth;
      if (canvas.style.height !== shownHeight) canvas.style.height = shownHeight;
      const camera = orbitCamera(frame.yaw, frame.pitch);
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
      gl.uniform2f(center, frame.center?.x ?? frame.width / 2, frame.center?.y ?? frame.height / 2);
      gl.uniform3f(eye, ...camera.eye);
      gl.uniform3f(right, ...camera.right);
      gl.uniform3f(down, ...camera.down);
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
