import { afterEach, expect, it, vi } from 'vitest';
import { createNativeListenMediaControls } from './native-media-controls';

afterEach(() => vi.unstubAllGlobals());

function setup(seekable: boolean) {
  const update = vi.fn();
  const clear = vi.fn();
  const remove = vi.fn();
  let command: (event: unknown) => void = () => {};
  const addListener = vi.fn((_event, callback) => {
    command = callback;
    return { remove };
  });
  vi.stubGlobal('navigator', { userAgent: 'ReadfoxApp/1' });
  vi.stubGlobal('window', {
    Capacitor: { Plugins: { NativeMediaControls: { update, clear, addListener } } },
  });
  const controls = {
    play: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    position: () => 8,
    duration: () => 10,
    ...(seekable ? { seek: vi.fn() } : {}),
  };
  const media = createNativeListenMediaControls('Chapter', 'Book', controls);
  return {
    media,
    controls,
    update,
    clear,
    remove,
    addListener,
    command: (action: string) => command({ action }),
  };
}

it('syncs audio metadata and state, clamps remote seeks, and clears on disposal', async () => {
  const state = setup(true);
  await vi.waitFor(() => expect(state.addListener).toHaveBeenCalledOnce());
  state.media.update(true, 10, 8, true, false);
  expect(state.update).toHaveBeenCalledWith({
    title: 'Chapter',
    artist: 'Readfox',
    album: 'Book',
    playing: true,
    duration: 10,
    elapsed: 8,
    canNext: true,
    canPrevious: false,
    canSeek: true,
  });
  for (const action of ['play', 'pause', 'next', 'previous']) state.command(action);
  expect(state.controls.play).toHaveBeenCalledOnce();
  expect(state.controls.pause).toHaveBeenCalledOnce();
  expect(state.controls.next).toHaveBeenCalledOnce();
  expect(state.controls.previous).toHaveBeenCalledOnce();
  state.command('toggle');
  expect(state.controls.pause).toHaveBeenCalledTimes(2);
  state.media.update(false, 10, 8, false, true);
  state.command('toggle');
  expect(state.controls.play).toHaveBeenCalledTimes(2);
  state.command('seekForward');
  expect(state.controls.seek).toHaveBeenLastCalledWith(10);
  state.command('seekBackward');
  expect(state.controls.seek).toHaveBeenLastCalledWith(3);
  state.media.dispose();
  expect(state.remove).toHaveBeenCalledOnce();
  expect(state.clear).toHaveBeenCalledOnce();
});

it('supports TTS commands without inventing a duration or enabling seeks', async () => {
  const state = setup(false);
  await vi.waitFor(() => expect(state.addListener).toHaveBeenCalledOnce());
  state.media.update(false, 0, NaN, true, true);
  expect(state.update).toHaveBeenCalledWith(
    expect.objectContaining({ canSeek: false, playing: false }),
  );
  expect(state.update.mock.calls[0][0]).not.toHaveProperty('duration');
  expect(state.update.mock.calls[0][0]).not.toHaveProperty('elapsed');
  state.command('next');
  expect(state.controls.next).toHaveBeenCalledOnce();
  state.command('seekForward');
  state.media.dispose();
});
