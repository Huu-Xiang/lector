'use client';

import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent;
  }
}

export type InstallPlatform = 'installed' | 'prompt' | 'wechat' | 'ios' | 'android' | 'desktop';

const PROMPT_EVENT = 'readfox:installprompt';

export function detectInstallPlatform(env: {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasPrompt: boolean;
}): InstallPlatform {
  const ua = env.userAgent;
  if (env.standalone) return 'installed';
  // WeChat's in-app browser has no install or home-screen action.
  if (/MicroMessenger/i.test(ua)) return 'wechat';
  if (env.hasPrompt) return 'prompt';
  // iPadOS reports a Mac user agent; touch points tell them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function snapshot(): InstallPlatform {
  return detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    hasPrompt: Boolean(window.__installPrompt),
  });
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia('(display-mode: standalone)');
  window.addEventListener(PROMPT_EVENT, onChange);
  window.addEventListener('appinstalled', onChange);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(PROMPT_EVENT, onChange);
    window.removeEventListener('appinstalled', onChange);
    media.removeEventListener('change', onChange);
  };
}

/** `unknown` during SSR and the first client render. */
export function useInstallPlatform(): InstallPlatform | 'unknown' {
  return useSyncExternalStore(subscribe, snapshot, () => 'unknown' as const);
}

/** Opens the browser's install dialog. Chrome allows one call per saved event. */
export async function promptInstall(): Promise<boolean> {
  const event = window.__installPrompt;
  if (!event) return false;
  window.__installPrompt = undefined;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  } finally {
    window.dispatchEvent(new Event(PROMPT_EVENT));
  }
}
