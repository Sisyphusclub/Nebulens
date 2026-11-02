import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useFileUpload } from '@/hooks/useFileUpload';
import { MAX_REFERENCE_IMAGES } from '@/types/image';

function makeFile(name: string, type = 'image/png'): File {
  return new File(['data'], name, { type });
}

describe('useFileUpload', () => {
  it('starts with no files selected', () => {
    const { result } = renderHook(() => useFileUpload());
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it('adds a single file and generates a stable id', () => {
    const { result } = renderHook(() => useFileUpload());
    const file = makeFile('photo.png');

    act(() => {
      result.current.selectFile(file);
    });

    expect(result.current.selectedFiles).toHaveLength(1);
    expect(result.current.selectedFiles[0]?.file).toBe(file);
    expect(typeof result.current.selectedFiles[0]?.id).toBe('string');
  });

  it('assigns a previewUrl for image files and null for non-images', () => {
    const { result } = renderHook(() => useFileUpload());
    const imgFile = makeFile('ref.webp', 'image/webp');
    const pdfFile = makeFile('doc.pdf', 'application/pdf');

    act(() => {
      result.current.selectFiles([imgFile, pdfFile]);
    });

    expect(result.current.selectedFiles[0]?.previewUrl).toMatch(/^blob:/);
    expect(result.current.selectedFiles[1]?.previewUrl).toBeNull();
  });

  it('sets a validationMessage only for unrecognised MIME types', () => {
    const { result } = renderHook(() => useFileUpload());
    const known = makeFile('a.jpg', 'image/jpeg');
    const unknown = makeFile('b.tiff', 'image/tiff');

    act(() => {
      result.current.selectFiles([known, unknown]);
    });

    expect(result.current.selectedFiles[0]?.validationMessage).toBeNull();
    expect(result.current.selectedFiles[1]?.validationMessage).toBeTruthy();
  });

  it(`enforces the ${MAX_REFERENCE_IMAGES}-image limit and returns accurate counts`, () => {
    const { result } = renderHook(() => useFileUpload());
    const files = Array.from({ length: MAX_REFERENCE_IMAGES + 2 }, (_, i) =>
      makeFile(`img${i}.png`),
    );

    let outcome!: ReturnType<typeof result.current.selectFiles>;
    act(() => {
      outcome = result.current.selectFiles(files);
    });

    expect(result.current.selectedFiles).toHaveLength(MAX_REFERENCE_IMAGES);
    expect(outcome.added).toBe(MAX_REFERENCE_IMAGES);
    expect(outcome.skipped).toBe(2);
  });

  it('does not add more files once the limit is already reached', () => {
    const { result } = renderHook(() => useFileUpload());
    const first = Array.from({ length: MAX_REFERENCE_IMAGES }, (_, i) => makeFile(`first${i}.png`));

    act(() => {
      result.current.selectFiles(first);
    });
    expect(result.current.selectedFiles).toHaveLength(MAX_REFERENCE_IMAGES);

    const namesBefore = result.current.selectedFiles.map((f) => f.file.name);
    act(() => {
      result.current.selectFiles([makeFile('extra.png')]);
    });

    expect(result.current.selectedFiles).toHaveLength(MAX_REFERENCE_IMAGES);
    expect(result.current.selectedFiles.map((f) => f.file.name)).toEqual(namesBefore);
  });

  it('removes a file by id without affecting other files', () => {
    const { result } = renderHook(() => useFileUpload());
    const [a, b, c] = [makeFile('a.png'), makeFile('b.png'), makeFile('c.png')];

    act(() => {
      result.current.selectFiles([a, b, c]);
    });

    const targetId = result.current.selectedFiles[1]?.id ?? '';
    act(() => {
      result.current.removeFile(targetId);
    });

    expect(result.current.selectedFiles).toHaveLength(2);
    expect(result.current.selectedFiles.map((f) => f.file)).toEqual([a, c]);
  });

  it('clears all selected files', () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => {
      result.current.selectFiles([makeFile('x.png'), makeFile('y.png')]);
    });
    expect(result.current.selectedFiles).toHaveLength(2);

    act(() => {
      result.current.clear();
    });
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it('replaceFiles resets existing selections and applies the new set', () => {
    const { result } = renderHook(() => useFileUpload());
    act(() => {
      result.current.selectFiles([makeFile('old1.png'), makeFile('old2.png')]);
    });

    act(() => {
      result.current.replaceFiles([makeFile('new.png')]);
    });

    expect(result.current.selectedFiles).toHaveLength(1);
    expect(result.current.selectedFiles[0]?.file.name).toBe('new.png');
  });
});
