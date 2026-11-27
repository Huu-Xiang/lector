interface ListenMediaControls {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  seek?: (seconds: number) => void;
  position?: () => number;
  duration?: () => number;
}

export function createListenMediaSession(
  title: string,
  album: string,
  controls: ListenMediaControls,
) {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    typeof MediaMetadata === 'undefined'
  ) {
    return null;
  }
  const session = navigator.mediaSession;
  session.metadata = new MediaMetadata({ title, artist: 'Readfox', album });
  const registered: MediaSessionAction[] = [];
  const register = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      session.setActionHandler(action, handler);
      registered.push(action);
    } catch {}
  };
  const seek = (seconds: number) => {
    const duration = controls.duration?.() ?? 0;
    if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return;
    controls.seek?.(Math.max(0, Math.min(duration, seconds)));
  };
  register('play', controls.play);
  register('pause', controls.pause);
  register('previoustrack', controls.previous);
  register('nexttrack', controls.next);
  if (controls.seek) {
    register('seekbackward', ({ seekOffset }) =>
      seek((controls.position?.() ?? 0) - (seekOffset ?? 5)),
    );
    register('seekforward', ({ seekOffset }) =>
      seek((controls.position?.() ?? 0) + (seekOffset ?? 5)),
    );
    register('seekto', ({ seekTime }) => {
      if (seekTime !== undefined) seek(seekTime);
    });
  }
  return {
    update(playing: boolean, duration: number, position: number, playbackRate: number) {
      session.playbackState = playing ? 'playing' : 'paused';
      if (
        !controls.seek ||
        !session.setPositionState ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isFinite(position) ||
        !Number.isFinite(playbackRate) ||
        playbackRate <= 0
      ) {
        return;
      }
      try {
        session.setPositionState({
          duration,
          position: Math.max(0, Math.min(duration, position)),
          playbackRate,
        });
      } catch {}
    },
    dispose() {
      for (const action of registered) {
        try {
          session.setActionHandler(action, null);
        } catch {}
      }
      session.playbackState = 'none';
      session.metadata = null;
      try {
        session.setPositionState?.();
      } catch {}
    },
  };
}
