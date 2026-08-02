import { renderHook, act } from '@testing-library/react';
import { useViewMode } from '../../src/hooks/useViewMode';

describe('useViewMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with the fallback when nothing is stored', () => {
    const { result } = renderHook(() => useViewMode('stores', 'list'));

    expect(result.current[0]).toBe('list');
  });

  it('reads a previously stored mode for the given key', () => {
    window.localStorage.setItem('cafe-music:view:stores', 'grid');

    const { result } = renderHook(() => useViewMode('stores', 'list'));

    expect(result.current[0]).toBe('grid');
  });

  it('writes changes to localStorage under a key-scoped namespace', () => {
    const { result } = renderHook(() => useViewMode('playlists', 'grid'));

    act(() => result.current[1]('list'));

    expect(result.current[0]).toBe('list');
    expect(window.localStorage.getItem('cafe-music:view:playlists')).toBe('list');
  });

  it('keeps separate state per key', () => {
    window.localStorage.setItem('cafe-music:view:stores', 'grid');

    const { result } = renderHook(() => useViewMode('playlists', 'grid'));

    expect(result.current[0]).toBe('grid');
  });
});
