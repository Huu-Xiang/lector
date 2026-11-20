'use client';

import PageHeader from '@/components/PageHeader';
import { useTranslations } from 'next-intl';
import FeedbackForm from './components/FeedbackForm';
import WeChatContact from './components/WeChatContact';

export default function FeedbackPage() {
  const t = useTranslations('feedback');
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={t('title')} />
      <div className="space-y-6">
        <FeedbackForm />
        <WeChatContact />
      </div>
    </main>
  );
}
