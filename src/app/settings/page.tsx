'use client';

import DataManagement from './components/DataManagement';
import Export from './components/Export';
import KnownWordsImport from './components/KnownWordsImport';
import APITokens from './components/APITokens';
import TwoFactorSettings from './components/TwoFactorSettings';
import Timezone from './components/Timezone';
import ThemeSettings from './components/ThemeSettings';
import AnkiSettings from './components/AnkiSettings';
import TTSSettings from './components/TTSSettings';
import LLMSettings from './components/LLMSettings';
import PracticeSettings from './components/PracticeSettings';
import ProseSettings from './components/ProseSettings';
import LanguagesSettings from './components/LanguagesSettings';
import CnRefund from './components/CnRefund';
import NativeLanguage from './components/NativeLanguage';
import InterfaceLanguage from './components/InterfaceLanguage';
import VersionInfo from './components/VersionInfo';
import DeleteAccount from './components/DeleteAccount';
import PageHeader from '@/components/PageHeader';
import BYOKSettings from './components/BYOKSettings';
import CloudPlanSettings from './components/CloudPlanSettings';
import InviteCard from './components/InviteCard';
import { lectorMode } from '@/lib/api-base';
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const t = useTranslations('settings');
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={t('pageTitle')} />
      <div className="space-y-8">
        {lectorMode() === 'cloud' && <CloudPlanSettings />}
        {lectorMode() === 'cloud' && <CnRefund />}
        {lectorMode() === 'cloud' && <InviteCard />}
        <LanguagesSettings />
        <section className="panel space-y-6 p-6" data-testid="language-preferences">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-foreground">
              {t('languagePrefs.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('languagePrefs.hint')}</p>
          </div>
          <InterfaceLanguage />
          <NativeLanguage />
        </section>
        <ProseSettings />
        <PracticeSettings />
        {lectorMode() === 'cloud' ? <BYOKSettings /> : <LLMSettings />}
        <AnkiSettings />
        <TTSSettings />
        <ThemeSettings />
        <Timezone />
        <TwoFactorSettings />
        <APITokens />
        <KnownWordsImport />
        <Export />
        <DataManagement />
        <DeleteAccount />
        <VersionInfo />
      </div>
    </main>
  );
}
