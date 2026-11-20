'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api-base';
import { useLectorMode } from '@/lib/use-env';

const MAX_CHARS = 5000;
const MAX_IMAGES = 3;
const MAX_IMAGE_MB = 5;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

interface Attached {
  id: number;
  file: File;
  url: string;
}

const ERROR_KEYS: Record<string, string> = {
  invalid_message: 'empty',
  too_many_images: 'tooManyImages',
  image_too_large: 'imageTooLarge',
  bad_image_type: 'imageType',
  too_large: 'tooLarge',
  rate_limited: 'rateLimited',
};

export default function FeedbackForm() {
  const t = useTranslations('feedback');
  const locale = useLocale();
  const mode = useLectorMode();
  const { data: session } = authClient.useSession();
  const email = mode === 'cloud' ? session?.user.email : undefined;

  const [text, setText] = useState('');
  const [images, setImages] = useState<Attached[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const nextId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    return () => imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
  }, []);

  function addFiles(files: File[]) {
    const accepted = files.filter((file) => IMAGE_TYPES.includes(file.type));
    if (accepted.length < files.length) setError(t('errors.imageType'));
    else setError(null);
    if (accepted.length === 0) return;
    if (accepted.some((file) => file.size > MAX_IMAGE_MB * 1024 * 1024)) {
      setError(t('errors.imageTooLarge', { size: MAX_IMAGE_MB }));
      return;
    }
    if (images.length + accepted.length > MAX_IMAGES) {
      setError(t('errors.tooManyImages', { count: MAX_IMAGES }));
      return;
    }
    setImages((current) => [
      ...current,
      ...accepted.map((file) => ({ id: nextId.current++, file, url: URL.createObjectURL(file) })),
    ]);
  }

  function removeImage(id: number) {
    setImages((current) => {
      current.filter((image) => image.id === id).forEach((image) => URL.revokeObjectURL(image.url));
      return current.filter((image) => image.id !== id);
    });
    setError(null);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length > 0) addFiles(files);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) {
      setError(t('errors.empty'));
      return;
    }
    if (message.length > MAX_CHARS) {
      setError(t('errors.tooLong'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('message', message);
      form.set('locale', locale);
      images.forEach((image) => form.append('images', image.file, image.file.name));
      const res = await apiFetch('/api/feedback', { method: 'POST', body: form });
      if (res.ok) {
        images.forEach((image) => URL.revokeObjectURL(image.url));
        setImages([]);
        setText('');
        setDone(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      const key = ERROR_KEYS[body.error as string] ?? 'failed';
      setError(t(`errors.${key}`, { count: MAX_IMAGES, size: MAX_IMAGE_MB }));
    } catch {
      setError(t('errors.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="panel space-y-4 p-6" data-testid="feedback-success">
        <p className="text-base font-medium text-foreground">{t('successTitle')}</p>
        <Button variant="outline" onClick={() => setDone(false)} data-testid="feedback-another">
          {t('sendAnother')}
        </Button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6" data-testid="feedback-form">
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <div className="space-y-2">
        <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
          {t('messageLabel')}
        </label>
        <textarea
          id="feedback-message"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={onPaste}
          maxLength={MAX_CHARS}
          rows={8}
          placeholder={t('placeholder')}
          className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          data-testid="feedback-message"
        />
        <p className="text-right text-xs text-muted-foreground">
          {t('counter', { count: text.length, max: MAX_CHARS })}
        </p>
      </div>

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-3" data-testid="feedback-images">
          {images.map((image) => (
            <li key={image.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.file.name}
                className="h-20 w-20 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(image.id)}
                aria-label={t('removeImage', { name: image.file.name })}
                className="absolute -top-2 -right-2 rounded-full border border-border bg-card p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          className="hidden"
          data-testid="feedback-file"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={images.length >= MAX_IMAGES}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={16} />
          {t('addImage')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('imagesHint', { count: MAX_IMAGES, size: MAX_IMAGE_MB })}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="feedback-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{email ? t('replyTo', { email }) : ''}</p>
        <Button type="submit" disabled={busy} data-testid="feedback-send">
          {busy ? t('sending') : t('send')}
        </Button>
      </div>
    </form>
  );
}
