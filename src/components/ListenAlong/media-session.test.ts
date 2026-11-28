import { afterEach, describe, expect, test, vi } from 'vitest';
import { createListenMediaSession } from './media-session';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const session = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn((action, handler) => handlers.set(action, handler)),
    setPositionState: vi.fn(),
  };
  vi.stubGlobal('navigator', { mediaSession: session });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(public data: MediaMetadataInit) {}
    },
  );
  const controls = {
    play: vi.fn(),
    pause: vi.fn(),
    previous: vi.fn(),
    next: vi.fn(),
    seek: vi.fn(),
    position: () => 8,
    duration: () => 10,
  };
  return { handlers, session, controls };
}

describe('ListenAlong media session', () => {
  test('does nothing without browser media APIs or MediaMetadata', () => {
    const { controls, session } = setup();
    vi.stubGlobal('MediaMetadata', undefined);
    expect(createListenMediaSession('Lesson', 'English', controls)).toBeNull();
    expect(session.setActionHandler).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', undefined);
    expect(createListenMediaSession('Lesson', 'English', controls)).toBeNull();
  });

  test('routes transport actions, clamps audio seeks and position, and cleans up', () => {
    const { handlers, session, controls } = setup();
    const media = createListenMediaSession('Lesson', 'English', controls)!;
    for (const [action, callback] of [
      ['play', controls.play],
      ['pause', controls.pause],
      ['previoustrack', controls.previous],
      ['nexttrack', controls.next],
    ] as const) {
      handlers.get(action)?.({ action });
      expect(callback).toHaveBeenCalledOnce();
    }
    handlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 20 });
    expect(controls.seek).toHaveBeenLastCalledWith(10);
    handlers.get('seekbackward')?.({ action: 'seekbackward', seekOffset: 20 });
    expect(controls.seek).toHaveBeenLastCalledWith(0);
    handlers.get('seekto')?.({ action: 'seekto', seekTime: 3 });
    expect(controls.seek).toHaveBeenLastCalledWith(3);
    handlers.get('seekto')?.({ action: 'seekto', seekTime: NaN });
    expect(controls.seek).toHaveBeenCalledTimes(3);
    media.update(true, 10, 12, 0.9);
    expect(session.playbackState).toBe('playing');
    expect(session.setPositionState).toHaveBeenLastCalledWith({
      duration: 10,
      position: 10,
      playbackRate: 0.9,
    });
    media.update(false, 0, 0, 1);
    media.update(false, Infinity, 0, 1);
    media.update(false, 10, NaN, 1);
    expect(session.setPositionState).toHaveBeenCalledOnce();
    media.dispose();
    expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
    expect(session.playbackState).toBe('none');
    expect(session.metadata).toBeNull();
  });

  test('TTS exposes sentence transport without audio seeking or a fabricated timeline', () => {
    const { controls, handlers, session } = setup();
    const media = createListenMediaSession('Lesson', 'English', {
      play: controls.play,
      pause: controls.pause,
      previous: controls.previous,
      next: controls.next,
    })!;
    expect(handlers.has('seekto')).toBe(false);
    media.update(true, 10, 2, 1);
    expect(session.setPositionState).not.toHaveBeenCalled();
    media.dispose();
  });

  test('unsupported actions and position APIs do not crash playback or cleanup', () => {
    const { controls, session } = setup();
    session.setActionHandler.mockImplementation(() => {
      throw new Error('Unsupported');
    });
    session.setPositionState.mockImplementation(() => {
      throw new Error('Unsupported');
    });
    const media = createListenMediaSession('Lesson', 'English', controls)!;
    expect(() => media.update(true, 10, 1, 1)).not.toThrow();
    expect(() => media.dispose()).not.toThrow();
  });
});
