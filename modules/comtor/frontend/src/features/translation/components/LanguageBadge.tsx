
import type { SonioxLanguage } from '@cmt/lib/soniox';

interface LanguageBadgeProps {
  /** Language to display as a flag badge. */
  language: SonioxLanguage;
  /** Optional extra CSS classes. */
  className?: string;
}

const LANGUAGE_CONFIG: Record<SonioxLanguage, { flag: string; label: string }> = {
  ja: { flag: '🇯🇵', label: 'Japanese' },
  vi: { flag: '🇻🇳', label: 'Vietnamese' },
  en: { flag: '🇺🇸', label: 'English' },
  zh: { flag: '🇨🇳', label: 'Chinese' },
  ko: { flag: '🇰🇷', label: 'Korean' },
};

/**
 * LanguageBadge — emoji flag indicating spoken language.
 *
 * Supported:
 * - 🇯🇵 Japanese (ja)
 * - 🇻🇳 Vietnamese (vi)
 * - 🇺🇸 English (en)
 * - 🇨🇳 Chinese (zh)
 * - 🇰🇷 Korean (ko)
 */
export function LanguageBadge({ language, className = '' }: LanguageBadgeProps) {
  const config = LANGUAGE_CONFIG[language] ?? { flag: '🌐', label: language.toUpperCase() };

  return (
    <span
      role="img"
      aria-label={config.label}
      className={`text-base leading-none ${className}`}
      title={config.label}
    >
      {config.flag}
    </span>
  );
}

export default LanguageBadge;
