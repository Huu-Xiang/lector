'use client';

import { useEffect, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronRight,
  Globe2,
  HardDrive,
  Info,
  LayoutGrid,
  Shield,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

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
import DailyGoalSettings from './components/DailyGoalSettings';
import PracticeSettings from './components/PracticeSettings';
import ProseSettings from './components/ProseSettings';
import LanguagesSettings from './components/LanguagesSettings';
import ReadingLevelSettings from './components/ReadingLevelSettings';
import CnRefund from './components/CnRefund';
import NativeLanguage from './components/NativeLanguage';
import InterfaceLanguage from './components/InterfaceLanguage';
import VersionInfo from './components/VersionInfo';
import DeleteAccount from './components/DeleteAccount';
import PageHeader from '@/components/PageHeader';
import BYOKSettings from './components/BYOKSettings';
import CloudPlanSettings from './components/CloudPlanSettings';
import InviteCard from './components/InviteCard';
import InstallAppCard from './components/InstallAppCard';
import ReminderSettings from './components/ReminderSettings';
import MobileTabs from './components/MobileTabs';
import { hasNativeTabBar, useIsNativeApp } from '@/lib/native-app';
import { lectorMode } from '@/lib/api-base';
import { useTranslations } from 'next-intl';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const nativeApp = useIsNativeApp();
  const cloud = lectorMode() === 'cloud';
  const accountSettings = (
    <>
      {cloud && <CloudPlanSettings />}
      {cloud && <CnRefund />}
      {cloud && <InviteCard />}
      <InstallAppCard />
      {cloud && <ReminderSettings />}
    </>
  );
  const languagePreferences = (
    <section className="panel space-y-6 p-6" data-testid="language-preferences">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">{t('languagePrefs.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('languagePrefs.hint')}</p>
      </div>
      <InterfaceLanguage />
      <NativeLanguage />
    </section>
  );
  if (nativeApp) {
    return (
      <main
        className="native-compact-page mx-auto max-w-3xl px-4 py-8"
        data-testid="iphone-settings"
      >
        <PageHeader title={t('pageTitle')} />
        <SettingsGroups>
          <SettingsGroup title={t('groups.languages')} icon={Globe2}>
            <section className="panel space-y-4 p-4" data-testid="language-preferences">
              <InterfaceLanguage compact />
              <NativeLanguage compact />
            </section>
            <LanguagesSettings />
            <ReadingLevelSettings />
          </SettingsGroup>
          <SettingsGroup
            title={t('groups.reading')}
            icon={BookOpen}
            anchors="review-goal product-emails"
          >
            <DailyGoalSettings />
            <ProseSettings />
            <PracticeSettings />
            {cloud && <ReminderSettings />}
          </SettingsGroup>
          <SettingsGroup title={t('groups.appearance')} icon={LayoutGrid}>
            {hasNativeTabBar() && <MobileTabs />}
            <ThemeSettings />
          </SettingsGroup>
          <SettingsGroup title={t('groups.account')} icon={UserRound} anchors="plan">
            {cloud && <CloudPlanSettings />}
            {cloud && <CnRefund />}
            {cloud && <InviteCard />}
            <Timezone />
          </SettingsGroup>
          <SettingsGroup
            title={t('groups.integrations')}
            icon={SlidersHorizontal}
            anchors="byok anki-integration"
          >
            {cloud ? <BYOKSettings /> : <LLMSettings />}
            <AnkiSettings />
            <TTSSettings />
          </SettingsGroup>
          <SettingsGroup title={t('groups.data')} icon={HardDrive}>
            <KnownWordsImport />
            <Export />
            <DataManagement />
          </SettingsGroup>
          <SettingsGroup title={t('groups.security')} icon={Shield}>
            <TwoFactorSettings />
            <APITokens />
            <DeleteAccount />
          </SettingsGroup>
          <SettingsGroup title={t('about.title')} icon={Info}>
            <VersionInfo hideTitle />
          </SettingsGroup>
        </SettingsGroups>
      </main>
    );
  }

  return (
    <main className="native-compact-page mx-auto max-w-3xl px-4 py-8">
      <PageHeader title={t('pageTitle')} />
      <div className="settings-panels space-y-8">
        {accountSettings}
        <LanguagesSettings />
        <ReadingLevelSettings />
        <DailyGoalSettings />
        {languagePreferences}
        <ProseSettings />
        <PracticeSettings />
        {cloud ? <BYOKSettings /> : <LLMSettings />}
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

function SettingsGroups({ children }: { children: ReactNode }) {
  useEffect(() => {
    function revealAnchor() {
      const anchor = location.hash.slice(1);
      if (!anchor) return;
      const target = document.getElementById(anchor);
      const group =
        target?.closest<HTMLDetailsElement>('details[data-settings-group]') ??
        Array.from(
          document.querySelectorAll<HTMLDetailsElement>('details[data-settings-group]'),
        ).find((element) => element.dataset.settingsAnchors?.split(' ').includes(anchor));
      if (!group) return;
      group.open = true;
      (target ?? group).scrollIntoView({ block: 'start' });
    }
    revealAnchor();
    window.addEventListener('hashchange', revealAnchor);
    return () => window.removeEventListener('hashchange', revealAnchor);
  }, []);

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}

function SettingsGroup({
  title,
  icon: Icon,
  anchors,
  children,
}: {
  title: string;
  icon: LucideIcon;
  anchors?: string;
  children: ReactNode;
}) {
  return (
    <details className="group scroll-mt-20" data-settings-group="" data-settings-anchors={anchors}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent [&::-webkit-details-marker]:hidden">
        <Icon className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground group-open:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="settings-panels space-y-3 border-t border-border bg-background/70 p-2">
        {children}
      </div>
    </details>
  );
}
