'use client';

import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  passedRules,
  passwordStrength,
  type PasswordRule,
  type PasswordStrength,
} from '@/lib/password-strength';

const RULES: PasswordRule[] = ['length', 'letter', 'digit'];

const BAR_CLASS: Record<PasswordStrength, string> = {
  empty: 'bg-muted',
  weak: 'bg-destructive',
  fair: 'bg-amber-500',
  strong: 'bg-primary',
};

const FILLED: Record<PasswordStrength, number> = { empty: 0, weak: 1, fair: 2, strong: 3 };

export default function PasswordMeter({ password }: { password: string }) {
  const t = useTranslations('auth.passwordMeter');
  const strength = passwordStrength(password);
  const passed = passedRules(password);

  return (
    <div className="space-y-2" data-testid="password-meter" data-strength={strength}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < FILLED[strength] ? BAR_CLASS[strength] : 'bg-muted'}`}
            />
          ))}
        </div>
        <span className="w-10 text-right text-xs text-muted-foreground" aria-live="polite">
          {strength === 'empty' ? '' : t(strength)}
        </span>
      </div>
      <ul className="space-y-1 text-xs">
        {RULES.map((rule) => (
          <li
            key={rule}
            className={`flex items-center gap-1.5 ${passed[rule] ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {passed[rule] ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Circle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t(`rules.${rule}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
