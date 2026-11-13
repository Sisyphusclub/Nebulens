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

/** Runs a frame every 16ms, the first at `from` and the last at `to`. */
function play(from: number, to: number): void {
  for (let now = from; now <= to; now += 16) step(now);
}

function shiftX(): number {
  return uniforms.get('u_shift')?.[0] ?? 0;
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
});

it('follows the composer when it grows', () => {
  render(<Hero />);
  step(0);

  measure.mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('home-backdrop__stars')) return rect(280, 0, 1160, 688);
    if (this.dataset.testid === 'composer') return rect(300, 280, 1120, 258);
    return rect(0, 0, 0, 0);
  });
  step(16);

  expect(uniforms.get('u_lens')).toEqual([580, 409, 560, 129]);
  expect(uniforms.get('u_buffer')).toEqual([2320, 1376]);
});

it('keeps drifting on its own, so the stars flow round the composer without any input', () => {
  render(<Hero />);
  step(0);
  const start = shiftX();

  play(16, 1008);

  expect(shiftX()).toBeGreaterThan(start);
  expect(gl.drawArrays).toHaveBeenCalledTimes(64);
  expect(uniforms.get('u_time')?.[0]).toBeCloseTo(1.008, 3);
});

it('slides the stars against the mouse, easing towards it rather than jumping', () => {
  // The drift alone, as the baseline.
  const baseline = render(<Hero />);
  step(0);
  step(16);
  const driftAfterOneFrame = shiftX();
  play(32, 4000);
  const driftAfterFourSeconds = shiftX();
  baseline.unmount();

  render(<Hero />);
  step(0);
  // Far to the right of the backdrop's centre, which is at x = 860.
  movePointer(1340, 320);
  step(16);
  const justMoved = shiftX() - driftAfterOneFrame;
  play(32, 4000);
  const settled = shiftX() - driftAfterFourSeconds;

  // A star is drawn at its own place minus the shift: a larger shift moves it left.
  expect(justMoved).toBeGreaterThan(0);
  expect(justMoved).toBeLessThan(settled / 2);
  // The stars are far away: they move a fraction of what the mouse did.
  expect(settled).toBeLessThan(480 / 2);
});

it('ignores touches, which scroll the page rather than point at it', () => {
  const baseline = render(<Hero />);
  step(0);
  step(16);
  const drift = shiftX();
  baseline.unmount();

  render(<Hero />);
  step(0);
  movePointer(1340, 320, 'touch');
  step(16);

  expect(shiftX()).toBe(drift);
});

it('draws at most sixty times a second, however fast the screen refreshes', () => {
  render(<Hero />);
  step(0);
  // A 120Hz screen asks for a frame every 8ms.
  for (let now = 8; now <= 1000; now += 8) step(now);

  expect(gl.drawArrays.mock.calls.length).toBeGreaterThanOrEqual(60);
  expect(gl.drawArrays.mock.calls.length).toBeLessThanOrEqual(64);
  // Time still runs at its own pace.
  expect(uniforms.get('u_time')?.[0]).toBeCloseTo(1, 1);
});

it('gives up sharpness when the GPU cannot keep up, and never below half', () => {
  render(<Hero />);
  step(0);
  play(16, 4000);
  // A steady sixty frames a second keeps the full two device pixels per pixel.
  expect(uniforms.get('u_scale')).toEqual([2]);

  // Then every frame takes 40ms.
  let now = 4000;
  for (let frame = 0; frame < 60; frame += 1) step((now += 40));
  expect(uniforms.get('u_scale')).toEqual([1.5]);
  expect(uniforms.get('u_buffer')).toEqual([1740, 960]);

  for (let frame = 0; frame < 400; frame += 1) step((now += 40));
  expect(uniforms.get('u_scale')).toEqual([1]);
});

it('does not mistake a busy page load or a long pause for a slow GPU', () => {
  render(<Hero />);
  step(0);
  // The first second is uneven while the page is still loading.
  let now = 0;
  for (let frame = 0; frame < 20; frame += 1) step((now += 45));
  play(now + 16, now + 3200);
  // Coming back from another tab is one long gap, not a slow frame.
  step(now + 60_000);
  play(now + 60_016, now + 61_600);

  expect(uniforms.get('u_scale')).toEqual([2]);
});

it('draws one still frame when reduced motion is on', () => {
  render(<Hero reducedMotion />);
  step(0);

  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  expect(uniforms.get('u_lens')).toEqual([580, 385, 560, 105]);
  expect(uniforms.get('u_shift')).toEqual([0, 0]);
  expect(uniforms.get('u_time')).toEqual([0]);
  expect(frames).toHaveLength(0);

  movePointer(1340, 320);
  expect(frames).toHaveLength(0);
});

it('draws the still frame again when the tab comes back, in case the browser dropped it', () => {
  render(<Hero reducedMotion />);
  step(0);
  expect(frames).toHaveLength(0);

  fireEvent(document, new Event('visibilitychange'));
  step(5000);

  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  expect(uniforms.get('u_time')).toEqual([0]);
  expect(frames).toHaveLength(0);
});

it('draws one still frame on low-end devices and with data saver on', () => {
  stubNavigator({ hardwareConcurrency: 2 });
  const first = render(<Hero />);
  step(0);
  expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  expect(frames).toHaveLength(0);
  first.unmount();

  stubNavigator({ hardwareConcurrency: 8, connection: { saveData: true } });
  render(<Hero />);
  step(0);
  expect(gl.drawArrays).toHaveBeenCalledTimes(2);
  expect(frames).toHaveLength(0);
});

it('stops drawing while scrolled out of view and picks up again when visible', () => {
  render(<Hero />);
  step(0);
  expect(frames).toHaveLength(1);

  act(() => observerCallback?.([{ isIntersecting: false }]));
  expect(frames).toHaveLength(0);

  act(() => observerCallback?.([{ isIntersecting: true }]));
  expect(frames).toHaveLength(1);
  // The time away is not replayed as one long jump.
  step(60_000);
  step(60_016);
  expect(uniforms.get('u_time')?.[0]).toBeLessThan(1);
});

it('asks for a GPU-backed context only, so a software renderer leaves the hero plain', () => {
  render(<Hero />);

  // Drawing the sky on the CPU every frame would cost more than the sky is worth.
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
  const canvas = container.querySelector('.home-backdrop__stars canvas')!;

  unmount();

  expect(loseContext).toHaveBeenCalledTimes(1);
  expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  expect(canvas).not.toBeInTheDocument();
  expect(frames).toHaveLength(0);
  movePointer(10, 10);
  expect(frames).toHaveLength(0);
});
