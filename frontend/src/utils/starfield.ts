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
 * The box draws the sky in: each pixel outside it shows the sky that really lies further
 * out, by an amount that grows with the distance from the box's edge and then levels off.
 * So the sky around the box is squeezed into a band along its edge, many times over right
 * at the edge, and the squeezed stars smear along the outline into streaks. All lengths
 * are CSS pixels.
 */
export const STARFIELD_FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_buffer;
uniform float u_scale;
uniform vec4 u_lens;
uniform float u_radius;
uniform vec3 u_eye;
uniform vec3 u_right;
uniform vec3 u_down;

// The sky is drawn in towards the box: a star 260 pixels or more from its edge appears 260
// pixels nearer, and the ones nearer than that pile up against the edge. The pull has two
// parts, measured on the look this follows: a steep one that acts within 62 pixels of the
// edge, and a gentle one that reaches almost three times as far.
const float NEAR_PULL = 150.0;
const float NEAR_REACH = 62.0;
const float NEAR_STEEP = 2.4;
const float FAR_PULL = 110.0;
const float FAR_REACH = 170.0;
// The distance from the camera to the screen, which sets how wide its view is.
const float FOCAL = 1000.0;
// A star thinner than this many device pixels would flicker as it moves, so it dims instead.
const float THINNEST = 1.15;

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
// screen across that direction, where it fans out round a corner of the box.
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
      float longer = 1.0 + (smear - 1.0) * (0.45 + 1.1 * look.y * look.y);
      float wide = min(max(size * longer, THINNEST / u_scale) * fan, cell * 0.12);
      float thin = max(size / squeeze, THINNEST / u_scale);
      float across = dot(away, normal) / squeeze / thin;
      float along = dot(away, vec2(-normal.y, normal.x)) / wide;
      float r2 = across * across + along * along;
      if (r2 < 16.0) {
        vec2 mood = fract(look * vec2(57.13, 91.71) + place.yx * 13.7);
        // Squeezed light is brighter light.
        float bright =
          mix(dimmest, brightest, look.y * look.y) * (0.55 + 0.45 * look.x) *
          (1.0 + 0.25 * (squeeze - 1.0));
        // A sharp core with soft wings: the brightest stars burn out in the middle and glow.
        float shine = 1.0 / pow(1.0 + r2, 2.5);
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
  float open = 1.0;
  vec3 light = vec3(0.0);

  if (u_lens.z > 0.0) {
    vec2 rel = p - u_lens.xy;
    vec2 halfSize = u_lens.zw;
    float edge = roundedBox(rel, halfSize, u_radius);
    float outside = max(edge, 0.0);
    // Outwards from the nearest point of the outline.
    vec2 turning = max(abs(rel) - halfSize + u_radius, 0.0);
    normal = sign(rel) * normalize(turning + 0.0001);

    // This pixel shows the sky that is really "pulled" pixels further out.
    float near = clamp(1.0 - outside / NEAR_REACH, 0.0, 1.0);
    float far = clamp(1.0 - outside / FAR_REACH, 0.0, 1.0);
    float pulled = NEAR_PULL * (1.0 - pow(near, NEAR_STEEP)) + FAR_PULL * (1.0 - far * far);
    seen = p + normal * pulled;
    // How many times over the sky is squeezed here: the slope of the pull.
    squeeze =
      1.0 +
      NEAR_PULL * NEAR_STEEP / NEAR_REACH * pow(near, NEAR_STEEP - 1.0) +
      FAR_PULL * 2.0 / FAR_REACH * far;
    // Squeezed stars smear along the outline, most of all right at the edge.
    smear =
      1.0 + 0.2 * (squeeze - 1.0) + 2.0 * exp(-outside / 5.0) +
      0.45 * (1.0 - smoothstep(40.0, 110.0, outside));
    // Round a corner the pulled-in sky comes from a wider arc than the one it is shown on.
    float fromTurn = length(turning);
    if (turning.x > 0.0 && turning.y > 0.0) fan = (fromTurn + pulled) / fromTurn;

    // Nothing shows through the box. A grainy bright rim runs along its edge, and a haze
    // fades away from it.
    open = smoothstep(-0.5, 1.0, edge);
    float haze = 0.14 * exp(-outside / 21.0);
    // The rim is brightest on the edge itself and gone two pixels out; inside the box it
    // is cut off at once.
    float sparkle = 0.8 + 0.9 * grain(p * 0.42) * grain(p * 0.13 + 7.0);
    float rim = 0.56 * sparkle * exp(-outside / 1.25) * smoothstep(-1.2, 0.0, edge);
    light += HAZE * haze * open + vec3(0.88, 0.92, 1.0) * rim;
  }

  // The camera looks at the middle of the canvas.
  seen -= u_buffer / u_scale * 0.5;
  vec3 stars =
    starSheet(seen, -0.3, 62.0, 0.0, 1.15, 2.5, 0.4, 1.4, normal, squeeze, smear, fan) +
    starSheet(seen, -0.14, 84.0, 37.0, 1.2, 3.0, 0.45, 1.9, normal, squeeze, smear, fan) +
    starSheet(seen, 0.16, 126.0, 91.0, 1.35, 3.8, 0.5, 2.4, normal, squeeze, smear, fan) +
    starSheet(seen, 0.42, 210.0, 53.0, 2.0, 5.4, 0.8, 3.0, normal, squeeze, smear, fan);
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
