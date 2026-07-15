import type { UiLocalePreference } from '@maka/core';

export interface UiLocaleUpdateGate {
  begin(hasLocalePreference: boolean): number | null;
  cancel(ticket: number | null): void;
  commit(
    ticket: number | null,
    preference: UiLocalePreference,
    onUiLocalePreferenceChange: (preference: UiLocalePreference) => void,
  ): boolean;
  beginHydration(): UiLocaleHydrationTicket;
  commitHydration(
    ticket: UiLocaleHydrationTicket,
    preference: UiLocalePreference,
    onUiLocalePreferenceChange: (preference: UiLocalePreference) => void,
  ): boolean;
}

export interface UiLocaleHydrationTicket {
  readonly id: number;
  readonly localeWriteRevision: number;
  readonly startedWhileWritePending: boolean;
}

/**
 * Keeps locale writes ordered independently from unrelated Settings writes.
 * The gate deliberately outlives the Settings surface's mounted ownership:
 * AppShell owns the callback and must receive a successful persisted value
 * even when the modal closes before the IPC response arrives.
 */
export function createUiLocaleUpdateGate(): UiLocaleUpdateGate {
  let latestTicket = 0;
  let latestHydrationTicket = 0;
  const pendingTickets = new Set<number>();

  return {
    begin(hasLocalePreference) {
      if (!hasLocalePreference) return null;
      const ticket = ++latestTicket;
      pendingTickets.add(ticket);
      return ticket;
    },
    cancel(ticket) {
      if (ticket !== null) pendingTickets.delete(ticket);
    },
    commit(ticket, preference, onUiLocalePreferenceChange) {
      if (ticket !== null) pendingTickets.delete(ticket);
      if (ticket === null || ticket !== latestTicket) return false;
      onUiLocalePreferenceChange(preference);
      return true;
    },
    beginHydration() {
      return {
        id: ++latestHydrationTicket,
        localeWriteRevision: latestTicket,
        startedWhileWritePending: pendingTickets.size > 0,
      };
    },
    commitHydration(ticket, preference, onUiLocalePreferenceChange) {
      if (
        ticket.id !== latestHydrationTicket
        || ticket.localeWriteRevision !== latestTicket
        || ticket.startedWhileWritePending
        || pendingTickets.size > 0
      ) {
        return false;
      }
      onUiLocalePreferenceChange(preference);
      return true;
    },
  };
}
