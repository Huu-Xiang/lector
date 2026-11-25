'use client';

import clsx from 'clsx';
import { MessageCircle, X, SendHorizonal } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useActiveLanguage } from '@/utils/hooks';
import { apiFetch, isBareRoute } from '@/lib/api-base';
import { languageDisplayName } from '@/lib/language-names';
import { isComposing } from '@/lib/keyboard';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useIsNativeApp } from '@/lib/native-app';
import { hasOwnHeader } from '@/components/NativeBridge/tab-bar';
import {
  CHAT_ASK_CONTEXT_EVENT,
  CHAT_TOGGLE_EVENT,
  EXAMPLE_PROMPTS,
  type ChatAskContextDetail,
} from './constants';
import ChatMessageContent from './ChatMessageContent';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: string | null;
  createdAt: string;
}

export default function ChatWidget() {
  const t = useTranslations('chat');
  const inApp = useIsNativeApp();
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialLoadDone = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const activeLang = useActiveLanguage();
  const [threadLangOverride, setThreadLangOverride] = useState<string | null>(null);
  const chatLangCode = threadLangOverride ?? activeLang.code;
  const chatLangRef = useRef(chatLangCode);
  const sessionSeqRef = useRef(0);
  const askFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const langName = languageDisplayName(chatLangCode, locale, activeLang.name);

  useEffect(() => {
    chatLangRef.current = chatLangCode;
  }, [chatLangCode]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchMessages = useCallback(async () => {
    const langCode = chatLangCode;
    const seq = sessionSeqRef.current;
    try {
      const res = await apiFetch(`/api/chat?limit=50&language=${langCode}`);
      const data = await res.json();
      if (seq !== sessionSeqRef.current || langCode !== chatLangRef.current) return;
      setMessages(data);
      setHasMore(data.length === 50);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  }, [chatLangCode]);

  // Clear any lesson-specific language override when the user switches active language.
  useEffect(() => {
    setThreadLangOverride(null);
  }, [activeLang.code]);

  // Reset history whenever the chat thread language changes so threads never bleed across languages.
  useEffect(() => {
    sessionSeqRef.current += 1;
    initialLoadDone.current = false;
    lastMessageIdRef.current = null;
    setMessages([]);
    setHasMore(true);
    setLoadingHistory(false);
    setLoading(false);
  }, [chatLangCode]);

  // Load messages when opened (or after language switch while open)
  useEffect(() => {
    if (isOpen && !initialLoadDone.current) {
      initialLoadDone.current = true;
      void fetchMessages();
    }
    // On iOS a focused field raises the keyboard at once and pushes the sheet up.
    if (isOpen && !inApp) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, fetchMessages, inApp, chatLangCode]);

  // Scroll to bottom only when a newer message is appended (never when loadMore prepends).
  const latestMessageId = messages.at(-1)?.id ?? null;
  useEffect(() => {
    if (isOpen && latestMessageId && latestMessageId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = latestMessageId;
      scrollToBottom();
    }
  }, [latestMessageId, isOpen, scrollToBottom]);

  async function loadMore() {
    if (loadingHistory || !hasMore || messages.length === 0) return;
    setLoadingHistory(true);

    const langCode = chatLangCode;
    const seq = sessionSeqRef.current;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    try {
      const oldest = messages[0];
      const res = await apiFetch(
        `/api/chat?limit=50&before=${encodeURIComponent(oldest.createdAt)}&language=${langCode}`,
      );
      const older = await res.json();
      if (seq !== sessionSeqRef.current || langCode !== chatLangRef.current) return;
      if (older.length === 0) {
        setHasMore(false);
      } else {
        setMessages((prev) => [...older, ...prev]);
        setHasMore(older.length === 50);
        // Maintain scroll position after prepending
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          }
        });
      }
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      if (seq === sessionSeqRef.current) {
        setLoadingHistory(false);
      }
    }
  }

  async function sendMessage(text?: string) {
    const content = (text || input).trim();
    if (!content || loading) return;

    const langCode = chatLangCode;
    const seq = sessionSeqRef.current;
    setInput('');
    setLoading(true);

    // Optimistic user message
    const tempUserMsg: ChatMessage = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content,
      provider: null,
      createdAt: new Date().toISOString(),
    };
    // Exclude failed exchanges (error- assistant turns and their paired failed-user- turns)
    // so client-supplied history stays strictly alternating user/assistant turns.
    const priorHistory = messages
      .filter((m) => !m.id.startsWith('error-') && !m.id.startsWith('failed-user-'))
      .slice(-18)
      .map(({ role, content: msgContent }) => ({ role, content: msgContent }));
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          language: langCode,
          history: priorHistory,
        }),
      });

      if (!res.ok) throw new Error('Failed to send message');

      const { userMessage, assistantMessage } = await res.json();
      if (seq !== sessionSeqRef.current || langCode !== chatLangRef.current) return;

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        userMessage,
        assistantMessage,
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      if (seq !== sessionSeqRef.current || langCode !== chatLangRef.current) return;
      // Replace optimistic message with error feedback
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: 'failed-user-' + Date.now() },
        {
          id: 'error-' + Date.now(),
          role: 'assistant' as const,
          content: t('error'),
          provider: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      if (seq === sessionSeqRef.current) {
        setLoading(false);
      }
    }
  }

  // Re-focus the input once loading drops back to false. Calling .focus() in the
  // sendMessage finally block fires before React re-renders the (disabled) textarea,
  // so the focus is a no-op. Doing it via an effect runs after the DOM update.
  // In the app only after a reply, so opening the chat does not raise the keyboard.
  const wasLoading = useRef(false);
  useEffect(() => {
    if (isOpen && !loading && (!inApp || wasLoading.current)) {
      inputRef.current?.focus();
    }
    wasLoading.current = loading;
  }, [loading, isOpen, inApp]);

  async function clearChat() {
    try {
      await apiFetch(`/api/chat?language=${chatLangCode}`, { method: 'DELETE' });
      setMessages([]);
      setHasMore(false);
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  }

  function handleScroll() {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 80 && hasMore && !loadingHistory) {
      loadMore();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // An IME commits its candidate with Enter (#289 4.5) — asking a question
    // about Chinese means typing Chinese into this box.
    if (isComposing(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  // On phones the button covers text, so it slides away while the reader scrolls down.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    const last = new WeakMap<object, number>();
    const onScroll = (event: Event) => {
      const target = event.target === document ? document.scrollingElement : event.target;
      if (!(target instanceof Element)) return;
      const top = target.scrollTop;
      const before = last.get(target) ?? 0;
      last.set(target, top);
      if (Math.abs(top - before) < 6) return;
      setTucked(top > before && top > 80);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  useEffect(() => {
    const toggle = () => setIsOpen((open) => !open);
    const askContext = (event: Event) => {
      const detail = (event as CustomEvent<ChatAskContextDetail>).detail;
      if (detail?.language && detail.language !== activeLang.code) {
        setThreadLangOverride(detail.language);
      } else {
        setThreadLangOverride(null);
      }
      setIsOpen(true);
      if (detail?.prompt) {
        setInput(detail.prompt);
      }
      if (!inApp) {
        if (askFocusTimerRef.current) clearTimeout(askFocusTimerRef.current);
        askFocusTimerRef.current = setTimeout(() => {
          askFocusTimerRef.current = null;
          inputRef.current?.focus();
        }, 100);
      }
    };
    window.addEventListener(CHAT_TOGGLE_EVENT, toggle);
    window.addEventListener(CHAT_ASK_CONTEXT_EVENT, askContext);
    return () => {
      window.removeEventListener(CHAT_TOGGLE_EVENT, toggle);
      window.removeEventListener(CHAT_ASK_CONTEXT_EVENT, askContext);
      if (askFocusTimerRef.current) {
        clearTimeout(askFocusTimerRef.current);
        askFocusTimerRef.current = null;
      }
    };
  }, [activeLang.code, inApp]);

  // Close chat on Escape without leaking to underlying reader shortcuts.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  // Chrome-free routes (#218/#224): the widget sits outside the layout
  // guards, so hide it itself — chat could only 401/402 there.
  if (isBareRoute(pathname)) return null;

  // In the app the top bar opens the chat; the reader has no top bar, so it keeps the button.
  const floatingButton = !inApp || hasOwnHeader(pathname);

  return (
    <>
      {floatingButton && (
        <>
          {/* Keeps the last row of a page clear of the button on phones (skipped on self-scrolling reader). */}
          {!hasOwnHeader(pathname) && (
            <div className="h-16 sm:hidden print:hidden" aria-hidden="true" />
          )}
          <Button
            onClick={toggleOpen}
            data-chat-toggle
            data-above-tabbar
            className={clsx(
              'fixed right-4 bottom-20 z-50 flex h-12 w-12 rounded-full shadow-lg transition-all hover:shadow-xl sm:right-6 sm:bottom-6 print:hidden',
              pathname.includes('/read') && '2xl:right-[406px]',
              tucked &&
                !isOpen &&
                'max-sm:pointer-events-none max-sm:translate-y-24 max-sm:opacity-0',
            )}
            aria-label={isOpen ? t('close') : t('open')}
            data-testid="chat-toggle"
          >
            {isOpen ? <X /> : <MessageCircle />}
          </Button>
        </>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className={clsx(
            'fixed right-4 bottom-36 z-50 flex h-[min(75dvh,calc(100dvh-10rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:right-6 sm:bottom-20 sm:h-[min(80dvh,38rem)] sm:w-96 print:hidden',
            pathname.includes('/read') && '2xl:right-[406px]',
          )}
          data-testid="chat-panel"
          role={inApp ? 'dialog' : undefined}
          aria-label={inApp ? t('tutorTitle', { language: langName }) : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('tutorTitle', { language: langName })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('tutorSubtitle', { language: langName })}
              </p>
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                onClick={clearChat}
                className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                title={t('clearTitle')}
                data-testid="chat-clear"
              >
                {t('clear')}
              </Button>
              {inApp && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleOpen}
                  aria-label={t('close')}
                  data-testid="chat-close"
                >
                  <X />
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
            data-testid="chat-messages"
          >
            {loadingHistory && (
              <div className="py-2 text-center text-xs text-muted-foreground">
                {t('loadingOlder')}
              </div>
            )}

            {messages.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="mb-4 text-sm text-muted-foreground">
                  {t('emptyPrompt', { language: langName })}
                </p>
                <div className="w-full space-y-2">
                  {EXAMPLE_PROMPTS[activeLang.code].map((prompt) => (
                    <Button
                      variant="ghost"
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="block h-auto w-full cursor-pointer rounded-lg bg-muted px-3 py-2 text-left text-xs whitespace-normal text-muted-foreground transition-colors hover:bg-[var(--primary-soft)] hover:text-primary"
                      data-testid="chat-example-prompt"
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <ChatMessageContent role={msg.role} content={msg.content} />
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
                      .
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
                      .
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
                      .
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-2">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('placeholder', { language: activeLang.native })}
                rows={1}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
                disabled={loading}
                data-testid="chat-input"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="chat-send"
              >
                <SendHorizonal className="-rotate-90" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
