// Text-to-Speech wrapper
// Uses managed TTS when entitled and available, otherwise browser TTS
import { getActiveLanguage, getEntitlements } from './data-layer';
import { apiFetch, lectorMode } from './api-base';
import {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageConfig,
  isValidLanguageCode,
  type LanguageCode,
  type LanguageConfig,
} from './languages';

// Default speech rate (1.0 is normal speed). Exported so callers that offer a
// speed control (e.g. dictation practice) can scale relative to the app's
// normal "1x" listening rate instead of hard-coding it.
export const DEFAULT_RATE = 0.9;

// Resolve the active language's TTS config. Browser-TTS voice selection is
// driven entirely off this, so switching the target language picks an
// appropriate voice instead of always assuming Afrikaans.
function activeLangConfig(): LanguageConfig {
  return LANGUAGES[getActiveLanguage() as LanguageCode] ?? LANGUAGES[DEFAULT_LANGUAGE];
}

function langConfigFor(language?: string): LanguageConfig {
  if (language && isValidLanguageCode(language)) {
    return getLanguageConfig(language);
  }
  return activeLangConfig();
}

function normalizeLangTag(tag: string): string {
  return tag.replace(/_/g, '-').trim().toLowerCase();
}

function primarySubtag(tag: string): string {
  return normalizeLangTag(tag).split('-')[0] ?? '';
}

function tagMatches(voiceLang: string, candidate: string): boolean {
  const normalizedVoice = normalizeLangTag(voiceLang);
  const normalizedCandidate = normalizeLangTag(candidate);
  if (!normalizedVoice || !normalizedCandidate) return false;
  if (normalizedVoice === normalizedCandidate) return true;
  const primary = primarySubtag(normalizedCandidate);
  return normalizedVoice === primary || normalizedVoice.startsWith(`${primary}-`);
}

// Accepted langs for a language, most-specific first — e.g.
// af → ['af-ZA', 'af', 'nl-NL', 'nl']; zh → ['cmn-CN', 'zh-Hans', 'zh', 'zh-CN'];
// ar → ['ar-XA', 'ar', 'ar-SA', 'ar-EG']. Includes script.bcp47 so Google-only
// ttsCodes (cmn-CN, ar-XA) never prevent matching standard BCP-47 OS voices.
function candidateLangsFor(config: LanguageConfig): string[] {
  const raw = [config.ttsCode, config.script.bcp47, config.code, ...(config.fallbackTts ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of raw) {
    if (!tag) continue;
    const key = normalizeLangTag(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function primaryTargetTags(config: LanguageConfig): string[] {
  return [config.ttsCode, config.script.bcp47, config.code].filter(
    (lang): lang is string => Boolean(lang),
  );
}

function matchesConfigLang(voice: SpeechSynthesisVoice, config: LanguageConfig): boolean {
  return candidateLangsFor(config).some((lang) => tagMatches(voice.lang, lang));
}

function browserUtteranceLang(config: LanguageConfig): string {
  const ttsCode = config.ttsCode;
  // Google-specific codes (cmn-CN, ar-XA) don't always match OS speech
  // synthesis tags when no explicit voice object is bound; prefer a standard
  // BCP-47 tag matching script.bcp47 in those cases.
  if (
    ttsCode &&
    !normalizeLangTag(ttsCode).endsWith('-xa') &&
    primarySubtag(ttsCode) === primarySubtag(config.script.bcp47)
  ) {
    return ttsCode;
  }
  const fallbackMatch = config.fallbackTts?.find(
    (tag) => primarySubtag(tag) === primarySubtag(config.script.bcp47),
  );
  return fallbackMatch ?? config.script.bcp47 ?? ttsCode ?? config.code;
}

function getSavedVoicePref(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(VOICE_PREF_KEY);
  } catch {
    return null;
  }
}

/**
 * Whether the active language has synthesized audio at all. Speaker buttons
 * gate on this: for `pronunciation.audio: 'none'` languages (disputed or
 * reconstructed pronunciation — #307 §3.2a) the speaker UI absents itself
 * rather than silently mis-speaking through a wrong-language browser voice.
 */
export function hasAudio(): boolean {
  return activeLangConfig().pronunciation.audio !== 'none';
}

/**
 * Whether a speaker control should render for the active language in this
 * browser: 'none' languages never speak; server-engine languages (eo →
 * eSpeak NG) always can, independent of browser voices; Google languages
 * keep the historical browser-TTS availability check (their fallback path).
 */
export function canSpeak(): boolean {
  const audio = activeLangConfig().pronunciation.audio;
  if (audio === 'none') return false;
  if (!audio.includes('google')) return true;
  return isTTSAvailable();
}

// Preferred voice name patterns (higher quality voices)
const PREFERRED_VOICE_PATTERNS = [/google/i, /premium/i, /enhanced/i, /natural/i, /neural/i];

// Voice names to avoid (often robotic sounding)
const AVOID_VOICE_PATTERNS = [/espeak/i, /mbrola/i];

// Cached voice selection for browser TTS
let cachedVoice: SpeechSynthesisVoice | undefined;
let voiceInitialized = false;

// Audio element for Google TTS playback
let audioElement: HTMLAudioElement | null = null;
// Retained until settled so Chromium does not GC active browser word utterances.
let activeWordUtterance: SpeechSynthesisUtterance | null = null;

// LocalStorage keys
const VOICE_PREF_KEY = 'lector-tts-voice';
const TTS_MODE_KEY = 'lector-tts-mode';

// TTS modes
export type TTSMode = 'google' | 'browser';

/**
 * Check if the browser supports the Web Speech API
 * @returns true if browser TTS is available
 */
export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Get the current TTS mode preference
 */
export function getTTSMode(): TTSMode {
  if (typeof window === 'undefined') return 'browser';
  return (localStorage.getItem(TTS_MODE_KEY) as TTSMode) || 'google';
}

/**
 * Set the TTS mode preference
 */
export function setTTSMode(mode: TTSMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TTS_MODE_KEY, mode);
}

/**
 * Score a voice based on quality indicators and match specificity for `config`.
 * Higher score = better quality.
 */
function scoreVoiceFor(voice: SpeechSynthesisVoice, config: LanguageConfig): number {
  let score = 0;

  // Prefer local/offline voices (usually higher quality)
  if (voice.localService) score += 5;

  // Prefer voices with preferred name patterns
  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    if (pattern.test(voice.name)) {
      score += 10;
      break;
    }
  }

  // Avoid certain voice types
  for (const pattern of AVOID_VOICE_PATTERNS) {
    if (pattern.test(voice.name)) {
      score -= 20;
      break;
    }
  }

  const voiceLang = normalizeLangTag(voice.lang);
  if (primaryTargetTags(config).some((tag) => tagMatches(voiceLang, tag))) {
    // Keep genuine target-language voices ahead of different-language fallbacks
    // (e.g. af-ZA ahead of nl-NL).
    score += 20;
  }

  if (config.ttsCode && voiceLang === normalizeLangTag(config.ttsCode)) score += 4;
  if (voiceLang === normalizeLangTag(config.script.bcp47)) score += 4;
  const fallbackFirst = config.fallbackTts?.[0];
  if (fallbackFirst && voiceLang === normalizeLangTag(fallbackFirst)) score += 2;

  return score;
}

/**
 * Get the best available browser voice for an explicit language code without
 * reading `getActiveLanguage()` or mutating the active-language preference.
 */
export function getVoiceForLanguage(language: string): SpeechSynthesisVoice | undefined {
  if (!isTTSAvailable()) {
    return undefined;
  }

  const config = langConfigFor(language);
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    return undefined;
  }

  const savedVoiceName = getSavedVoicePref();
  if (savedVoiceName) {
    const savedVoice = voices.find((v) => v.name === savedVoiceName);
    if (savedVoice && matchesConfigLang(savedVoice, config)) {
      return savedVoice;
    }
  }

  const candidateVoices = voices.filter((v) => matchesConfigLang(v, config));
  if (candidateVoices.length === 0) {
    return undefined;
  }

  candidateVoices.sort((a, b) => scoreVoiceFor(b, config) - scoreVoiceFor(a, config));
  return candidateVoices[0];
}

/**
 * Build a configured SpeechSynthesisUtterance for an explicit language using
 * browser voices only (never calls `/api/tts`).
 */
export function createBrowserUtterance(
  text: string,
  options: { language: string; rate?: number },
): SpeechSynthesisUtterance {
  const config = langConfigFor(options.language);
  const utterance = new SpeechSynthesisUtterance(text);

  const voice = getVoiceForLanguage(config.code);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = browserUtteranceLang(config);
  }

  const rate = options.rate ?? DEFAULT_RATE;
  utterance.rate = Math.max(0.1, Math.min(10, Number.isFinite(rate) ? rate : DEFAULT_RATE));
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  return utterance;
}

/**
 * Speak a single word or short phrase strictly via browser speech synthesis
 * for an explicit language. Never routes through `speakWithServer` or `/api/tts`.
 */
export function speakWordWithBrowser(
  text: string,
  language: string,
  rate: number = DEFAULT_RATE,
): void {
  if (!isTTSAvailable()) return;
  const config = langConfigFor(language);
  if (config.pronunciation.audio === 'none') return;
  const trimmed = text.trim();
  if (!trimmed) return;

  stopSpeaking();

  const utterance = createBrowserUtterance(trimmed, { language: config.code, rate });
  activeWordUtterance = utterance;
  const clear = () => {
    if (activeWordUtterance === utterance) activeWordUtterance = null;
  };
  utterance.onend = clear;
  utterance.onerror = clear;
  window.speechSynthesis.speak(utterance);
}

/**
 * Get the best available voice for the active language (browser TTS).
 * Caches the result for consistent voice selection.
 * @returns The voice to use, or undefined if none found
 */
function getActiveLanguageVoice(): SpeechSynthesisVoice | undefined {
  if (!isTTSAvailable()) {
    return undefined;
  }

  const config = activeLangConfig();

  // Return the cached voice only while it still matches the active language.
  // The cache outlives a server-side language switch (settings PUT without a
  // reload), and a stale voice is worse than none: a Latin voice handed
  // Cyrillic text plays silence rather than erroring.
  if (voiceInitialized && cachedVoice) {
    if (matchesConfigLang(cachedVoice, config)) return cachedVoice;
    cachedVoice = undefined;
    voiceInitialized = false;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    return undefined;
  }

  // Check for user's saved preference — but only reuse it if it still matches
  // the active language. The saved name is global, so an Afrikaans voice must
  // not be reused after the user switches the target language to German.
  const savedVoiceName = getSavedVoicePref();
  if (savedVoiceName) {
    const savedVoice = voices.find((v) => v.name === savedVoiceName);
    if (savedVoice && matchesConfigLang(savedVoice, config)) {
      cachedVoice = savedVoice;
      voiceInitialized = true;
      return cachedVoice;
    }
  }

  // Find all candidate voices for the active language (+ fallbacks)
  const candidateVoices = voices.filter((v) => matchesConfigLang(v, config));

  if (candidateVoices.length === 0) {
    voiceInitialized = true;
    return undefined;
  }

  // Sort by score and pick the best one
  candidateVoices.sort((a, b) => scoreVoiceFor(b, config) - scoreVoiceFor(a, config));
  cachedVoice = candidateVoices[0];
  voiceInitialized = true;

  // Save the selection for next time
  if (cachedVoice && typeof localStorage !== 'undefined') {
    localStorage.setItem(VOICE_PREF_KEY, cachedVoice.name);
  }

  return cachedVoice;
}

/**
 * Set a specific voice by name (browser TTS)
 * @param voiceName - The name of the voice to use
 */
export function setPreferredVoice(voiceName: string): void {
  if (!isTTSAvailable()) return;

  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.name === voiceName);

  if (voice) {
    cachedVoice = voice;
    voiceInitialized = true;
    localStorage.setItem(VOICE_PREF_KEY, voiceName);
  }
}

/**
 * Get the currently selected voice name
 */
export function getCurrentVoiceName(): string | undefined {
  return cachedVoice?.name || localStorage.getItem(VOICE_PREF_KEY) || undefined;
}

/**
 * Speak via the server TTS route. The API dispatches to the engine the active
 * language declares (`pronunciation.audio`): Google for the national-language
 * packs, self-hosted eSpeak NG for Esperanto (#307 §3.2c).
 * @returns true if successful, false if the caller may fall back to browser TTS
 */
async function speakWithServer(text: string, rate: number): Promise<boolean> {
  try {
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rate, language: getActiveLanguage() }),
    });

    const data = await response.json();

    // Check if we should fall back to browser TTS
    if (data.fallback || data.error) {
      console.log('Managed TTS unavailable:', data.error);
      return false;
    }

    // Stop any current audio
    stopSpeaking();

    // Create audio element and play
    const audioData = `data:${data.contentType};base64,${data.audioContent}`;
    audioElement = new Audio(audioData);
    audioElement.play();

    return true;
  } catch (error) {
    console.error('Server TTS error:', error);
    return false;
  }
}

/**
 * Speak using browser's speech synthesis
 */
function speakWithBrowser(text: string, rate: number): void {
  if (!isTTSAvailable()) {
    console.warn('Text-to-speech is not available in this browser');
    return;
  }

  // Stop any current speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  // Set the voice for the active language (falls back per the registry)
  const voice = getActiveLanguageVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    // Set language even without a specific voice (bcp47 covers languages
    // without a Google ttsCode).
    const config = activeLangConfig();
    utterance.lang = config.ttsCode ?? config.script.bcp47;
    // The browser will pick its default voice, which for a non-matching
    // language often plays nothing at all (e.g. a Latin voice handed
    // Cyrillic text) — leave a trail for that otherwise-silent failure.
    console.warn(
      `No ${config.name} browser voice found — install one in the OS or configure managed TTS`,
    );
  }

  // Set speech parameters
  utterance.rate = Math.max(0.1, Math.min(10, rate));
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Speak
  window.speechSynthesis.speak(utterance);
}

/**
 * Speaks text via system audio, dispatching on the active language's
 * pronunciation capability (#307 §3.2):
 * - `audio: 'none'` — no-op. Nothing can sensibly speak the language; the
 *   speaker UI is already absent (see `hasAudio`).
 * - server-engine-only languages (eo → eSpeak NG) — always the server route,
 *   unmetered, and NEVER browser TTS: there is no matching browser voice, so
 *   a failure surfaces instead of mis-speaking in the wrong language.
 * - Google languages — managed TTS when entitled, browser TTS otherwise
 *   (existing behavior).
 * @param text - The text to speak
 * @param rate - Speech rate (default 0.9 for clearer learning)
 */
export async function speak(text: string, rate: number = DEFAULT_RATE): Promise<void> {
  const audio = activeLangConfig().pronunciation.audio;
  if (audio === 'none') return;

  if (!audio.includes('google')) {
    // eSpeak-only language: no plan gating (synthesis is zero-marginal-cost
    // and unmetered on every tier — #307 §3.2c) and no browser fallback.
    const success = await speakWithServer(text, rate);
    if (!success) console.error('TTS failed and this language has no browser fallback voice');
    return;
  }

  const mode = getTTSMode();

  if (mode === 'google') {
    if (lectorMode() === 'cloud') {
      const entitlements = await getEntitlements();
      if (entitlements?.limits.ttsCharsPerMonth === 0) {
        // Free (including Free+BYOK) is browser-only. Persist the fallback so a
        // lapsed subscriber does not repeatedly make denied managed-TTS calls.
        setTTSMode('browser');
        speakWithBrowser(text, rate);
        return;
      }
    }
    const success = await speakWithServer(text, rate);
    if (success) return;
  }

  speakWithBrowser(text, rate);
}

/**
 * Stop any current speech (both Google and browser)
 */
export function stopSpeaking(): void {
  activeWordUtterance = null;

  // Stop browser TTS
  if (isTTSAvailable()) {
    window.speechSynthesis.cancel();
  }

  // Stop audio element
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement = null;
  }
}

/**
 * Get available voices for the active language (+ fallbacks) for browser TTS.
 * Useful for debugging or letting users choose a voice.
 * @returns Array of available voices
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isTTSAvailable()) {
    return [];
  }

  const voices = window.speechSynthesis.getVoices();
  const config = activeLangConfig();

  return voices.filter((v) => matchesConfigLang(v, config));
}

/**
 * Wait for voices to be loaded and initialize the cache
 * Some browsers load voices asynchronously
 * @returns Promise that resolves when voices are available
 */
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isTTSAvailable()) {
      resolve([]);
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const synth = window.speechSynthesis;

    const initializeAndResolve = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', initializeAndResolve);
      }
      const voices = synth.getVoices();
      // Pre-initialize the voice cache
      if (voices.length > 0 && !voiceInitialized) {
        getActiveLanguageVoice();
      }
      resolve(voices);
    };

    const voices = synth.getVoices();
    if (voices.length > 0) {
      initializeAndResolve();
      return;
    }

    // Wait for voiceschanged event
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', initializeAndResolve, { once: true });
    }

    // Timeout after 3 seconds
    timer = setTimeout(initializeAndResolve, 3000);
  });
}

/**
 * Reset voice cache (useful if user wants to re-select)
 */
export function resetVoiceCache(): void {
  cachedVoice = undefined;
  voiceInitialized = false;
  localStorage.removeItem(VOICE_PREF_KEY);
}

/**
 * Check if Google Cloud TTS is configured
 * Makes a test request to see if the API key is set
 */
export async function isGoogleTTSConfigured(): Promise<boolean> {
  try {
    const response = await apiFetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });
    const data = await response.json();
    return !data.fallback;
  } catch {
    return false;
  }
}
