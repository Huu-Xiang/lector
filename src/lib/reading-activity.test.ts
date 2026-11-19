import { describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_WINDOW_MS,
  TICK_MS,
  createReadingActivity,
  subscribeToReadingActivity,
} from './reading-activity';

function setup(wordCount = 1000, initialPercent = 0) {
  let t = 1_000_000;
  const send = vi.fn();
  const milestone = vi.fn();
  const activity = createReadingActivity({
    wordCount,
    send,
    milestone,
    initialPercent,
    now: () => t,
  });
  const advance = (ms: number) => {
    t += ms;
  };
  return { activity, send, milestone, advance };
}

/** Moves the clock forward in TICK_MS steps, ticking each time, with the tab visible. */
function run(
  { activity, advance }: ReturnType<typeof setup>,
  ms: number,
  visible = true,
  interact = false,
) {
  for (let spent = 0; spent < ms; spent += TICK_MS) {
    advance(TICK_MS);
    if (interact) activity.noteActivity();
    activity.tick(visible);
  }
}

describe('reading minutes', () => {
  it('adds one minute for each 60 s of active reading', () => {
    const s = setup();
    s.activity.noteActivity();
    s.activity.tick(true);
    for (let i = 0; i < 6; i += 1) run(s, 30_000, true, true);
    expect(s.send.mock.calls.filter(([field]) => field === 'minutesRead')).toEqual([
      ['minutesRead', 1],
      ['minutesRead', 1],
      ['minutesRead', 1],
    ]);
  });

  it('stops counting two minutes after the last interaction', () => {
    const s = setup();
    s.activity.noteActivity();
    run(s, 10 * 60_000);
    const minutes = s.send.mock.calls.reduce((n, [, amount]) => n + amount, 0);
    expect(minutes).toBe(ACTIVE_WINDOW_MS / 60_000);
  });

  it('counts nothing while the tab is hidden', () => {
    const s = setup();
    s.activity.noteActivity();
    s.activity.tick(false);
    run(s, 60_000, false, true);
    expect(s.send).not.toHaveBeenCalled();
  });

  it('does not count the idle gap before a new interaction', () => {
    const s = setup();
    s.activity.noteActivity();
    run(s, 10 * 60_000);
    s.send.mockClear();
    s.advance(30 * 60_000);
    s.activity.noteActivity();
    s.activity.tick(true);
    expect(s.send).not.toHaveBeenCalled();
  });

  it('sends nothing without an interaction', () => {
    const s = setup();
    run(s, 10 * 60_000);
    expect(s.send).not.toHaveBeenCalled();
  });
});

describe('words read', () => {
  it('ignores the first position, which is where a restored lesson opens', () => {
    const s = setup();
    s.activity.noteProgress(60);
    s.activity.tick(true);
    expect(s.send).not.toHaveBeenCalled();
  });

  it('counts the words between the baseline and the furthest point', () => {
    const s = setup(1000);
    s.activity.noteProgress(10);
    s.activity.noteProgress(30);
    s.activity.tick(true);
    expect(s.send).toHaveBeenCalledWith('wordsRead', 200);
  });

  it('counts each word once when the reader scrolls back and forth', () => {
    const s = setup(1000);
    s.activity.noteProgress(0);
    s.activity.noteProgress(40);
    s.activity.noteProgress(10);
    s.activity.noteProgress(40);
    s.activity.noteProgress(50);
    s.activity.tick(true);
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(s.send).toHaveBeenCalledWith('wordsRead', 500);
  });

  it('sends words once, then only the new ones', () => {
    const s = setup(1000);
    s.activity.noteProgress(0);
    s.activity.noteProgress(20);
    s.activity.tick(true);
    s.activity.tick(true);
    s.activity.noteProgress(25);
    s.activity.tick(true);
    expect(s.send.mock.calls).toEqual([
      ['wordsRead', 200],
      ['wordsRead', 50],
    ]);
  });

  it('caps at the lesson word count', () => {
    const s = setup(100);
    s.activity.noteProgress(0);
    s.activity.noteProgress(250);
    s.activity.tick(true);
    expect(s.send).toHaveBeenCalledWith('wordsRead', 100);
  });

  it('counts nothing for a lesson without a word count', () => {
    const s = setup(0);
    s.activity.noteProgress(0);
    s.activity.noteProgress(100);
    s.activity.tick(true);
    expect(s.send).not.toHaveBeenCalled();
  });
});

describe('subscribeToReadingActivity', () => {
  function targets() {
    const doc = new EventTarget() as EventTarget & { visibilityState: string };
    doc.visibilityState = 'visible';
    return { doc, win: new EventTarget() };
  }

  it('treats scroll, key, pointer and touch events as interaction', () => {
    const { doc, win } = targets();
    const activity = {
      noteActivity: vi.fn(),
      noteProgress: vi.fn(),
      noteShortEnd: vi.fn(),
      setAnalyticsEnabled: vi.fn(),
      tick: vi.fn(),
    };
    subscribeToReadingActivity(activity, doc, win, vi.fn() as never, vi.fn());
    for (const type of ['scroll', 'wheel', 'pointerdown', 'keydown', 'touchstart']) {
      win.dispatchEvent(new Event(type));
    }
    expect(activity.noteActivity).toHaveBeenCalledTimes(5);
  });

  it('ticks when the tab is hidden and stops after unsubscribe', () => {
    const { doc, win } = targets();
    const activity = {
      noteActivity: vi.fn(),
      noteProgress: vi.fn(),
      noteShortEnd: vi.fn(),
      setAnalyticsEnabled: vi.fn(),
      tick: vi.fn(),
    };
    const clearTimer = vi.fn();
    const off = subscribeToReadingActivity(activity, doc, win, vi.fn(() => 7) as never, clearTimer);
    activity.tick.mockClear();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(activity.tick).toHaveBeenCalledWith(false);
    off();
    win.dispatchEvent(new Event('keydown'));
    expect(activity.noteActivity).not.toHaveBeenCalled();
    expect(clearTimer).toHaveBeenCalledWith(7);
  });
});

describe('product reading milestones', () => {
  it('waits for effective reading when the reader reaches the end first', () => {
    const s = setup();
    s.activity.noteActivity();
    s.activity.noteProgress(95);
    run(s, 30_000);
    expect(s.milestone).not.toHaveBeenCalled();
    run(s, 30_000);
    expect(s.milestone.mock.calls).toEqual([
      ['started'],
      ['progress', 25],
      ['progress', 50],
      ['progress', 75],
      ['progress', 90],
      ['completed'],
    ]);
    s.activity.noteProgress(99);
    run(s, 60_000, true, true);
    expect(s.milestone).toHaveBeenCalledTimes(6);
  });

  it('ignores a restored position and passive scroll as evidence of completion', () => {
    const s = setup(1000, 94);
    s.activity.noteActivity(false);
    s.activity.noteProgress(94);
    run(s, 60_000);
    expect(s.milestone).not.toHaveBeenCalled();
    s.activity.noteActivity();
    s.activity.noteProgress(100);
    run(s, 60_000);
    expect(s.milestone.mock.calls).toEqual([['started']]);
  });

  it('allows visible short content to complete without a scroll', () => {
    const s = setup();
    s.activity.noteShortEnd();
    run(s, 60_000);
    expect(s.milestone).not.toHaveBeenCalled();
    s.activity.noteActivity();
    run(s, 60_000);
    expect(s.milestone.mock.calls).toEqual([['started'], ['completed']]);
  });

  it('excludes time and progress in edit or listen mode while preserving prior active time', () => {
    const s = setup();
    s.activity.noteActivity();
    run(s, 30_000);
    s.activity.setAnalyticsEnabled(false);
    s.activity.noteActivity();
    s.activity.noteProgress(95);
    run(s, 120_000);
    expect(s.milestone).not.toHaveBeenCalled();
    expect(s.send).toHaveBeenCalledWith('minutesRead', 1);

    s.activity.setAnalyticsEnabled(true);
    run(s, 60_000);
    expect(s.milestone).not.toHaveBeenCalled();
    s.activity.noteActivity();
    run(s, 30_000);
    expect(s.milestone.mock.calls).toEqual([['started']]);
  });

  it('extends an active reader session with trusted scrolling after input', () => {
    const s = setup();
    s.activity.noteActivity(false, true);
    run(s, 60_000);
    expect(s.milestone).not.toHaveBeenCalled();

    s.activity.noteActivity();
    run(s, ACTIVE_WINDOW_MS - 30_000);
    s.activity.noteActivity(false, true);
    run(s, 60_000);
    s.activity.noteProgress(90);
    expect(s.milestone.mock.calls).toContainEqual(['completed']);
  });
});
