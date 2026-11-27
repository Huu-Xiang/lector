'use client';

import { useEffect, type ReactNode } from 'react';
import {
  BookOpen,
  Globe2,
  HardDrive,
  Info,
  LayoutGrid,
  Shield,
  SlidersHorizontal,
  UserRound,
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
import MonolingualSettings from './components/MonolingualSettings';
import VersionInfo from './components/VersionInfo';
import DeleteAccount from './components/DeleteAccount';
import PageHeader from '@/components/PageHeader';
import CompactDisclosure from '@/components/CompactDisclosure';
import BYOKSettings from './components/BYOKSettings';
import CloudPlanSettings from './components/CloudPlanSettings';
import InviteCard from './components/InviteCard';
import InstallAppCard from './components/InstallAppCard';
import ReminderSettings from './components/ReminderSettings';
import MobileTabs from './components/MobileTabs';
import { isIPadApp } from '@/components/NativeBridge/ipad-layout';
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
      <MonolingualSettings />
    </section>
  );
  if (nativeApp) {
    return (
      <main
        className="native-compact-page mx-auto w-full max-w-3xl px-4 py-8"
        data-testid="iphone-settings"
      >
        <PageHeader title={t('pageTitle')} />
        <SettingsGroups>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.languages')}
            icon={Globe2}
            iconClassName="bg-blue-500/12 text-blue-600 dark:text-blue-400 sm:dark:text-primary"
          >
            <section className="panel space-y-4 p-4" data-testid="language-preferences">
              <InterfaceLanguage compact />
              <NativeLanguage compact />
              <MonolingualSettings compact />
            </section>
            <LanguagesSettings compact />
            <ReadingLevelSettings />
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.reading')}
            icon={BookOpen}
            iconClassName="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 sm:dark:text-primary"
            anchors="daily-goal review-goal product-emails"
          >
            <DailyGoalSettings compact />
            <ProseSettings />
            <PracticeSettings />
            {cloud && <ReminderSettings />}
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.appearance')}
            icon={LayoutGrid}
            iconClassName="bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 sm:dark:text-primary"
          >
            {(isIPadApp() || hasNativeTabBar()) && <MobileTabs />}
            <ThemeSettings />
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.account')}
            icon={UserRound}
            iconClassName="bg-amber-500/12 text-amber-600 dark:text-amber-400 sm:dark:text-primary"
            anchors="plan"
          >
            {cloud && <CloudPlanSettings />}
            {cloud && <CnRefund />}
            {cloud && <InviteCard />}
            <Timezone />
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.integrations')}
            icon={SlidersHorizontal}
            iconClassName="bg-violet-500/12 text-violet-600 dark:text-violet-400 sm:dark:text-primary"
            anchors="byok anki-integration"
          >
            {cloud ? <BYOKSettings /> : <LLMSettings />}
            <AnkiSettings />
            <TTSSettings />
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.data')}
            icon={HardDrive}
            iconClassName="bg-teal-500/12 text-teal-600 dark:text-teal-400 sm:dark:text-primary"
          >
            <KnownWordsImport />
            <Export />
            <DataManagement />
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('groups.security')}
            icon={Shield}
            iconClassName="bg-rose-500/12 text-rose-600 dark:text-rose-400 sm:dark:text-primary"
          >
            <TwoFactorSettings />
            <APITokens />
            <DeleteAccount />
          </CompactDisclosure>
          <CompactDisclosure
            name="settings-groups"
            title={t('about.title')}
            icon={Info}
            iconClassName="bg-slate-500/12 text-slate-600 dark:text-slate-400 sm:dark:text-primary"
          >
            <VersionInfo hideTitle />
          </CompactDisclosure>
        </SettingsGroups>
      </main>
    );
  }

  return (
    <main className="native-compact-page mx-auto w-full max-w-3xl px-4 py-8">
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
        target?.closest<HTMLDetailsElement>('details[name="settings-groups"]') ??
        Array.from(
          document.querySelectorAll<HTMLDetailsElement>('details[name="settings-groups"]'),
        ).find((element) => element.dataset.disclosureAnchors?.split(' ').includes(anchor));
      if (!group) return;
      group.open = true;
      (target ?? group).scrollIntoView({ block: 'start' });
    }
    revealAnchor();
    window.addEventListener('hashchange', revealAnchor);
    return () => window.removeEventListener('hashchange', revealAnchor);
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card sm:divide-y sm:divide-border sm:rounded-xl sm:border-border [&>details]:relative [&>details+details]:before:pointer-events-none [&>details+details]:before:absolute [&>details+details]:before:top-0 [&>details+details]:before:right-0 [&>details+details]:before:left-14 [&>details+details]:before:border-t [&>details+details]:before:border-border/60 sm:[&>details+details]:before:hidden">
      {children}
    </div>
  );
}
