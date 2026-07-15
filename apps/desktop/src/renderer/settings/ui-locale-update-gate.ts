import type { UiLocalePreference } from '@maka/core';

export interface UiLocaleUpdateGate {
  begin(hasLocalePreference: boolean): number | null;
  commit(
    ticket: number | null,
    preference: UiLocalePreference,
    onUiLocalePreferenceChange: (preference: UiLocalePreference) => void,
  ): boolean;
}

/**
 * Keeps locale writes ordered independently from unrelated Settings writes.
 * The gate deliberately outlives the Settings surface's mounted ownership:
 * AppShell owns the callback and must receive a successful persisted value
 * even when the modal closes before the IPC response arrives.
 */
export function createUiLocaleUpdateGate(): UiLocaleUpdateGate {
  let latestTicket = 0;

  return {
    begin(hasLocalePreference) {
      return hasLocalePreference ? ++latestTicket : null;
    },
    commit(ticket, preference, onUiLocalePreferenceChange) {
      if (ticket === null || ticket !== latestTicket) return false;
      onUiLocalePreferenceChange(preference);
      return true;
    },
  };
}
