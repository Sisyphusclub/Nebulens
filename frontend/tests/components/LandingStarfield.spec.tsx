import { act, createEvent, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';

import { LandingStarfield } from '@/components/landing/LandingStarfield';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

interface QueuedFrame {
  id: number;
  run: FrameRequestCallback;
}

let frames: QueuedFrame[] = [];
let nextFrameId = 1;
let observerCallback: ObserverCallback | null = null;
let uniforms = new Map<string, number[]>();
let gl: ReturnType<typeof fakeGl>;
let getContext: MockInstance;
let measure: MockInstance;
let resizeCallbacks: Array<() => void> = [];
const loseContext = vi.fn();
const originalObserver = globalThis.IntersectionObserver;

function fakeGl() {
  const set = (location: { name: string } | null, ...values: number[]): void => {
    if (location !== null) uniforms.set(location.name, values);
  };
  return {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    HIGH_FLOAT: 9,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ name })),
    uniform1f: vi.fn(set),
    uniform2f: vi.fn(set),
    uniform3f: vi.fn(set),
    uniform4f: vi.fn(set),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    getShaderPrecisionFormat: vi.fn(() => ({ precision: 23 })),
    getExtension: vi.fn(() => ({ loseContext })),
  };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    x: left,
    y: top,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  };
}

function stubNavigator(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { configurable: true, value });
  }
}

/** Runs the next queued animation frame at the given time, in milliseconds. */
function step(now: number): void {
  const frame = frames.shift();
  act(() => frame?.run(now));
}

/** Runs frames every 16ms from `from` until none is left waiting, and returns the last time. */
function playUntilStill(from: number): number {
  let now = from;
  while (frames.length > 0 && now < from + 20_000) {
    step(now);
    now += 16;
  }
  return now;
}

/** Where the camera stands: x to the right, y down, z towards the viewer. */
function eye(): number[] {
  return uniforms.get('u_eye') ?? [];
}

/** What the page's ResizeObserver would report when the sky or the composer changes size. */
function resizeObserved(): void {
  act(() => resizeCallbacks.forEach((notify) => notify()));
}

/** jsdom has no PointerEvent, so the fields the backdrop reads are set by hand. */
function movePointer(clientX: number, clientY: number, pointerType = 'mouse'): void {
  const event = createEvent.pointerMove(window);
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerType: { value: pointerType },
  });
  fireEvent(window, event);
}

function Hero({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const composer = useRef<HTMLDivElement>(null);
  return (
    <>
      <LandingStarfield lens={composer} reducedMotion={reducedMotion} />
      <div ref={composer} data-testid="composer" style={{ borderTopLeftRadius: 20 }} />
    </>
  );
}

beforeEach(() => {
  frames = [];
  resizeCallbacks = [];
  uniforms = new Map();
  gl = fakeGl();
  loseContext.mockClear();
  stubNavigator({ hardwareConcurrency: 8, deviceMemory: 8, connection: undefined });
  vi.stubGlobal('WebGLRenderingContext', class {});
  vi.stubGlobal('devicePixelRatio', 2);
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    frames.push({ id, run });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames = frames.filter((frame) => frame.id !== id);
  });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: ObserverCallback) {
        observerCallback = callback;
      }
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly notify: () => void;
      constructor(callback: () => void) {
        this.notify = callback;
        resizeCallbacks.push(this.notify);
      }
      disconnect(): void {
        resizeCallbacks = resizeCallbacks.filter((notify) => notify !== this.notify);
      }
      observe(): void {}
      unobserve(): void {}
    },
  );
  getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as MockInstance;
  getContext.mockImplementation(() => gl);
  // The backdrop starts after a 280px sidebar; the composer sits in the middle of it.
  measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
  measure.mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('home-backdrop__stars')) return rect(280, 0, 1160, 640);
    if (this.dataset.testid === 'composer') return rect(300, 280, 1120, 210);
    return rect(0, 0, 0, 0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  observerCallback = null;
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: originalObserver,
  });
});

it('draws the stars bending around the composer, and fades in once the first frame is up', () => {
  const { container } = render(<Hero />);
  const stars = container.querySelector('.home-backdrop__stars')!;

  expect(stars).toHaveAttribute('aria-hidden', 'true');
  expect(stars).toHaveAttribute('data-ready', 'false');

  step(0);

  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  expect(stars).toHaveAttribute('data-ready', 'true');
  expect(stars.querySelector('canvas')).toBeInTheDocument();
  // The composer's centre and half size, measured from the backdrop's own corner.
  expect(uniforms.get('u_lens')).toEqual([580, 385, 560, 105]);
  expect(uniforms.get('u_radius')).toEqual([20]);
  // 1160×640 at two device pixels per pixel.
  expect(uniforms.get('u_buffer')).toEqual([2320, 1280]);
  expect(uniforms.get('u_scale')).toEqual([2]);
  // The camera faces the sky head on until the mouse says otherwise.
  expect(eye()).toEqual([0, 0, 1]);
  expect(uniforms.get('u_right')).toEqual([1, 0, 0]);
  expect(uniforms.get('u_down')).toEqual([0, 1, 0]);
});

it('keeps the sky still while nothing happens: it is not drawn again', () => {
  render(<Hero />);
  step(0);

  expect(frames).toHaveLength(0);
  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
});

it('follows the composer when it grows', () => {
  render(<Hero />);
  step(0);

  measure.mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('home-backdrop__stars')) return rect(280, 0, 1160, 688);
    if (this.dataset.testid === 'composer') return rect(300, 280, 1120, 258);
    return rect(0, 0, 0, 0);
  });
  resizeObserved();
  step(16);

  expect(uniforms.get('u_lens')).toEqual([580, 409, 560, 129]);
  expect(uniforms.get('u_buffer')).toEqual([2320, 1376]);
  expect(frames).toHaveLength(0);
});

it('swings the camera towards the mouse, easing rather than jumping, then stops drawing', () => {
  render(<Hero />);
  step(0);

  // Well to the right of the sky's centre, which is at x = 860, and level with it.
  movePointer(1340, 320);
  expect(frames).toHaveLength(1);
  step(1000);
  step(1016);
  const [justMoved = 0] = eye();
  const end = playUntilStill(1032);
  const [settled = 0, level = 0, depth = 0] = eye();

  expect(justMoved).toBeGreaterThan(0);
  expect(justMoved).toBeLessThan(settled / 4);
  // The camera keeps its distance: it swings round the sky, it does not slide across it.
  expect(Math.hypot(settled, level, depth)).toBeCloseTo(1, 6);
  expect(level).toBe(0);
  // It leans only a little, under ten degrees even with the mouse near the edge, so the
  // sky shifts rather than swings.
  expect(settled).toBeGreaterThan(0.04);
  expect(settled).toBeLessThan(0.17);
  // It takes its time, about three seconds, and nothing is drawn after that.
  expect(end - 1032).toBeGreaterThan(2000);
  expect(end - 1032).toBeLessThan(3600);
  expect(frames).toHaveLength(0);
  const drawn = gl.drawArrays.mock.calls.length;

  movePointer(380, 320);
  playUntilStill(end + 500);
  expect(eye()[0]).toBeCloseTo(-settled, 6);
  expect(gl.drawArrays.mock.calls.length).toBeGreaterThan(drawn);
});

it('swings up and down with the mouse as well', () => {
  render(<Hero />);
  step(0);

  movePointer(860, 600);
  playUntilStill(16);

  const [across = 0, down = 0] = eye();
  expect(across).toBe(0);
  expect(down).toBeGreaterThan(0.03);
  expect(down).toBeLessThan(0.17);
  // The camera's own axes stay square to each other while it leans.
  const right = uniforms.get('u_right') ?? [];
  const below = uniforms.get('u_down') ?? [];
  const dot = (a: number[], b: number[]): number =>
    (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
  expect(dot(right, below)).toBeCloseTo(0, 6);
  expect(dot(right, eye())).toBeCloseTo(0, 6);
  expect(dot(below, eye())).toBeCloseTo(0, 6);
});

it('ignores touches, which scroll the page rather than point at it', () => {
  render(<Hero />);
  step(0);

  movePointer(1340, 320, 'touch');

  expect(frames).toHaveLength(0);
});

it('draws at most sixty times a second, however fast the screen refreshes', () => {
  render(<Hero />);
  step(0);
  movePointer(1340, 320);
  const before = gl.drawArrays.mock.calls.length;

  // A 120Hz screen asks for a frame every 8ms.
  for (let now = 8; now <= 500; now += 8) step(now);

  const drawn = gl.drawArrays.mock.calls.length - before;
  expect(drawn).toBeGreaterThanOrEqual(28);
  expect(drawn).toBeLessThanOrEqual(33);
});

/** Keeps the mouse crossing the sky, so the camera never comes to rest. */
function keepMoving(frame: number): void {
  if (frame % 12 === 0) movePointer(frame % 24 === 0 ? 1340 : 380, 320);
}

it('gives up sharpness when the GPU cannot keep up, and never below half', () => {
  render(<Hero />);
  step(0);
  let now = 0;
  let frame = 0;
  for (; now < 4000; frame += 1) {
    keepMoving(frame);
    step((now += 16));
  }
  // A steady sixty frames a second keeps the full two device pixels per pixel.
  expect(uniforms.get('u_scale')).toEqual([2]);

  // Then every frame takes 40ms.
  for (let slow = 0; slow < 60; slow += 1, frame += 1) {
    keepMoving(frame);
    step((now += 40));
  }
  expect(uniforms.get('u_scale')).toEqual([1.5]);
  expect(uniforms.get('u_buffer')).toEqual([1740, 960]);

  for (let slow = 0; slow < 400; slow += 1, frame += 1) {
    keepMoving(frame);
    step((now += 40));
  }
  expect(uniforms.get('u_scale')).toEqual([1]);
});

it('does not mistake a busy page load or time spent at rest for a slow GPU', () => {
  render(<Hero />);
  step(0);
  // The first second is uneven while the page is still loading.
  let now = 0;
  let frame = 0;
  for (; frame < 20; frame += 1) {
    keepMoving(frame);
    step((now += 45));
  }
  for (; now < 4100; frame += 1) {
    keepMoving(frame);
    step((now += 16));
  }
  // The mouse rests for a minute: the gap before the next frame is not a slow frame.
  now = playUntilStill(now + 16);
  movePointer(1100, 200);
  playUntilStill(now + 60_000);

  expect(uniforms.get('u_scale')).toEqual([2]);
});

it('draws one still frame when reduced motion is on, and leaves the mouse alone', () => {
  render(<Hero reducedMotion />);
  step(0);

  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  expect(uniforms.get('u_lens')).toEqual([580, 385, 560, 105]);
  expect(eye()).toEqual([0, 0, 1]);
  expect(frames).toHaveLength(0);

  movePointer(1340, 320);
  expect(frames).toHaveLength(0);
});

it('draws the frame again when the tab comes back, in case the browser dropped it', () => {
  render(<Hero reducedMotion />);
  step(0);
  expect(frames).toHaveLength(0);

  fireEvent(document, new Event('visibilitychange'));
  step(5000);

  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  expect(eye()).toEqual([0, 0, 1]);
  expect(frames).toHaveLength(0);
});

it('leaves the mouse alone on low-end devices and with data saver on', () => {
  stubNavigator({ hardwareConcurrency: 2 });
  const first = render(<Hero />);
  step(0);
  movePointer(1340, 320);
  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  expect(frames).toHaveLength(0);
  first.unmount();

  stubNavigator({ hardwareConcurrency: 8, connection: { saveData: true } });
  render(<Hero />);
  step(0);
  movePointer(1340, 320);
  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  expect(frames).toHaveLength(0);
});

it('draws nothing while scrolled out of view, and catches up with the mouse when back', () => {
  render(<Hero />);
  step(0);

  act(() => observerCallback?.([{ isIntersecting: false }]));
  movePointer(1340, 320);
  expect(frames).toHaveLength(0);

  act(() => observerCallback?.([{ isIntersecting: true }]));
  expect(frames).toHaveLength(1);
  playUntilStill(60_000);
  expect(eye()[0]).toBeGreaterThan(0.04);
});

it('asks for a GPU-backed context only, so a software renderer leaves the hero plain', () => {
  render(<Hero />);

  // Drawing the sky on the CPU would cost more than the sky is worth.
  expect(getContext).toHaveBeenCalledWith(
    'webgl',
    expect.objectContaining({ failIfMajorPerformanceCaveat: true }),
  );
});

it('leaves the hero plain where WebGL is unavailable', () => {
  getContext.mockImplementation(() => null);
  const { container } = render(<Hero />);
  const stars = container.querySelector('.home-backdrop__stars')!;

  expect(stars.querySelector('canvas')).not.toBeInTheDocument();
  expect(stars).toHaveAttribute('data-ready', 'false');
  expect(frames).toHaveLength(0);
});

it('leaves the hero plain when the shader does not build', () => {
  gl.getProgramParameter.mockReturnValue(false);
  const { container } = render(<Hero />);

  expect(container.querySelector('.home-backdrop__stars canvas')).not.toBeInTheDocument();
  expect(frames).toHaveLength(0);
});

it('starts over on a fresh canvas after the browser takes the GPU context away', () => {
  const { container } = render(<Hero />);
  step(0);
  const first = container.querySelector('.home-backdrop__stars canvas')!;

  const lost = new Event('webglcontextlost', { cancelable: true });
  act(() => {
    first.dispatchEvent(lost);
  });
  // Without this the browser never offers the context back.
  expect(lost.defaultPrevented).toBe(true);
  movePointer(1340, 320);
  expect(frames).toHaveLength(0);

  act(() => {
    first.dispatchEvent(new Event('webglcontextrestored'));
  });
  step(100);

  const second = container.querySelector('.home-backdrop__stars canvas')!;
  expect(second).not.toBe(first);
  expect(first).not.toBeInTheDocument();
  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
});

it('hands the GPU context back and stops listening when the page goes away', () => {
  const { container, unmount } = render(<Hero />);
  step(0);
  movePointer(1340, 320);
  const canvas = container.querySelector('.home-backdrop__stars canvas')!;

  unmount();

  expect(loseContext).toHaveBeenCalledTimes(1);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(canvas).not.toBeInTheDocument();
  expect(frames).toHaveLength(0);
  movePointer(10, 10);
  resizeObserved();
  expect(frames).toHaveLength(0);
});
