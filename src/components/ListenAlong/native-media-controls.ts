import {
  clearNativeMediaControls,
  onNativeMediaCommand,
  updateNativeMediaControls,
} from '@/lib/native-app';

export function createNativeListenMediaControls(
  title: string,
  album: string,
  controls: {
    play: () => void;
    pause: () => void;
    previous: () => void;
    next: () => void;
    seek?: (seconds: number) => void;
    position: () => number;
    duration: () => number;
  },
) {
  let playing = false;
  const stop = onNativeMediaCommand((action) => {
    switch (action) {
      case 'play':
        controls.play();
        break;
      case 'pause':
        controls.pause();
        break;
      case 'toggle':
        (playing ? controls.pause : controls.play)();
        break;
      case 'next':
        controls.next();
        break;
      case 'previous':
        controls.previous();
        break;
      case 'seekForward':
      case 'seekBackward': {
        const duration = controls.duration();
        const position = controls.position();
        if (
          controls.seek &&
          Number.isFinite(duration) &&
          duration > 0 &&
          Number.isFinite(position)
        ) {
          controls.seek(
            Math.max(0, Math.min(duration, position + (action === 'seekForward' ? 5 : -5))),
          );
        }
      }
    }
  });
  return {
    update(
      isPlaying: boolean,
      duration: number,
      elapsed: number,
      canNext: boolean,
      canPrevious: boolean,
    ) {
      playing = isPlaying;
      void updateNativeMediaControls({
        title,
        artist: 'Readfox',
        album,
        playing,
        ...(Number.isFinite(duration) && duration > 0 ? { duration } : {}),
        ...(Number.isFinite(elapsed) ? { elapsed: Math.max(0, elapsed) } : {}),
        canNext,
        canPrevious,
        canSeek: !!controls.seek,
      });
    },
    dispose() {
      stop();
      void clearNativeMediaControls();
    },
  };
}
