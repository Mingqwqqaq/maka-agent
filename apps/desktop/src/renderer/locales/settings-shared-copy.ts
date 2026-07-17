import type { UiCatalog, UiLocale } from '@maka/core';

export type SettingsSharedCopy = {
  modalLabel: string;
};

const SETTINGS_SHARED_COPY_BY_LOCALE = {
  zh: {
    modalLabel: '设置',
  },
  en: {
    modalLabel: 'Settings',
  },
} satisfies UiCatalog<SettingsSharedCopy>;

export function getSettingsSharedCopy(locale: UiLocale): SettingsSharedCopy {
  return SETTINGS_SHARED_COPY_BY_LOCALE[locale];
}
