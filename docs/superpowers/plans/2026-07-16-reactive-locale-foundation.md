# Reactive Locale Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one persisted locale preference and one reactive derived `zh | en` locale for `@maka/core`, `@maka/ui`, and the desktop renderer.

**Architecture:** `@maka/core` owns closed locale types and the pure resolution/Intl mapping policy. `@maka/ui` owns a React provider and typed catalogs, while desktop owns the persisted-preference state and visual-test override state. All existing locale-aware renderers consume context; DOM attributes remain synchronized outputs rather than a second input path.

**Tech Stack:** TypeScript 5.9, React 19, Node test runner, Electron desktop renderer, npm workspaces.

---

### Task 1: Canonicalize locale types and resolution in `@maka/core`

**Files:**
- Create: `packages/core/src/ui-locale.ts`
- Create: `packages/core/src/__tests__/ui-locale.test.ts`
- Modify: `packages/core/src/settings.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/__tests__/lang-pref.test.ts`

- [ ] **Step 1: Write failing locale contract tests**

Add tests that import the public core API and assert the exact supported arrays, both runtime guards, `auto -> zh`, explicit choices, override precedence, and Intl mapping:

```ts
assert.deepEqual([...UI_LOCALES], ['zh', 'en']);
assert.deepEqual([...UI_LOCALE_PREFERENCES], ['auto', 'zh', 'en']);
assert.equal(resolveUiLocale('auto'), 'zh');
assert.equal(resolveUiLocale('en'), 'en');
assert.equal(resolveUiLocale('en', 'zh'), 'zh');
assert.equal(uiLocaleToIntlLocale('zh'), 'zh-CN');
assert.equal(uiLocaleToIntlLocale('en'), 'en');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --workspace @maka/core test`

Expected: TypeScript build fails because `ui-locale.ts` and the public exports do not exist.

- [ ] **Step 3: Add the canonical core implementation**

Implement:

```ts
export const UI_LOCALES = ['zh', 'en'] as const;
export type UiLocale = typeof UI_LOCALES[number];
export type UiLocalePreference = 'auto' | UiLocale;
export const UI_LOCALE_PREFERENCES = ['auto', ...UI_LOCALES] as const;
export type UiCatalog<T> = Record<UiLocale, T>;

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'zh' || value === 'en';
}

export function isUiLocalePreference(value: unknown): value is UiLocalePreference {
  return value === 'auto' || isUiLocale(value);
}

export function resolveUiLocale(
  preference: UiLocalePreference,
  override?: UiLocale | null,
): UiLocale {
  if (override) return override;
  return preference === 'auto' ? 'zh' : preference;
}

export function uiLocaleToIntlLocale(locale: UiLocale): 'zh-CN' | 'en' {
  return locale === 'zh' ? 'zh-CN' : 'en';
}
```

Import the preference type/constants/guard into `settings.ts`, remove its duplicate declarations, and re-export the locale module from `index.ts`.

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `npm --workspace @maka/core test`

Expected: all core tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat(core): centralize UI locale contract`

### Task 2: Make core timestamp formatting explicitly locale-driven

**Files:**
- Modify: `packages/core/src/relative-time.ts`
- Modify: `packages/core/src/__tests__/relative-time.test.ts`

- [ ] **Step 1: Write failing zh/en formatter tests**

Add English and Chinese assertions that pass the locale explicitly as the third argument:

```ts
assert.match(formatRelativeTimestamp(NOW - 5 * 60_000, NOW, 'en'), /5 minutes ago/i);
assert.match(formatRelativeTimestamp(NOW - 5 * 60_000, NOW, 'zh'), /5.*分钟/);
```

Add a source assertion that `relative-time.ts` no longer reads `document.documentElement`.

- [ ] **Step 2: Run focused core tests and verify RED**

Run: `npm --workspace @maka/core test`

Expected: the English call still uses the Chinese DOM/default resolver.

- [ ] **Step 3: Thread `UiLocale` into formatter caches**

Change relative and compact timestamp functions to accept `locale: UiLocale = 'zh'` after the existing `now` argument, map through `uiLocaleToIntlLocale()`, and key caches by that mapped value. Delete the DOM-reading `resolveLocale()` helper. Preserve every existing time bucket and default behavior.

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `npm --workspace @maka/core test`

Expected: all core tests pass, including explicit zh/en output.

- [ ] **Step 5: Commit**

Commit message: `refactor(core): make timestamp locale explicit`

### Task 3: Add the reactive provider to `@maka/ui`

**Files:**
- Create: `packages/ui/src/locale-context.tsx`
- Create: `packages/ui/src/__tests__/locale-context.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/src/locale-helpers.ts`

- [ ] **Step 1: Write failing provider/context tests**

Test the provider API with a small server-rendered context probe. Test the provider's exported `syncUiLocaleDocument(locale, override)` helper separately with a fake `document.documentElement`; the provider layout effect must call this same helper:

```tsx
function Probe() {
  return <span>{useUiLocale()}</span>;
}

assert.equal(renderToStaticMarkup(
  <LocaleProvider preference="en"><Probe /></LocaleProvider>,
), '<span>en</span>');
```

The tests also cover `auto -> zh`, override precedence, missing-provider failure, `lang`, `data-maka-locale`, and `data-maka-visual-smoke-locale` synchronization.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm --workspace @maka/ui test`

Expected: build fails because `LocaleProvider` and `useUiLocale` do not exist.

- [ ] **Step 3: Implement provider and hook**

Implement a context with an undefined default, derive through core `resolveUiLocale`, synchronize HTML through `syncUiLocaleDocument()` in a layout effect guarded for non-DOM environments, and throw `useUiLocale must be used within LocaleProvider` outside the provider. Export the module from `index.ts`.

Keep prompt suggestions in `locale-helpers.ts`, import the canonical `UiLocale`/`UiCatalog` from core, require an explicit locale in `getPromptSuggestions(locale)`, and remove `detectUiLocale()`.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run: `npm --workspace @maka/ui test`

Expected: all UI tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat(ui): add reactive locale provider`

### Task 4: Migrate existing shared UI locale consumers

**Files:**
- Modify: `packages/ui/src/chat-empty-hero.tsx`
- Modify: `packages/ui/src/composer.tsx`
- Modify: `packages/ui/src/chat-display-helpers.ts`
- Modify: `packages/ui/src/relative-time.tsx`
- Modify: `packages/ui/src/session-history-list.tsx`
- Modify: `packages/ui/src/tool-activity.tsx`
- Modify: `packages/ui/src/tool-activity/presentation.ts`
- Modify: `packages/ui/src/__tests__/tool-activity-presentation.test.ts`
- Modify: affected component render tests to wrap `LocaleProvider`

- [ ] **Step 1: Add failing locale-reactivity and pure-helper tests**

Assert chat time helpers accept `UiLocale`, tool display helpers accept it explicitly, and source contains no `detectUiLocale` call:

```ts
assert.match(formatAbsoluteTimestamp(TS, 'en'), /2026|Jul/);
assert.equal(resolveToolDisplayName(connectorItem, 'en'), 'Load tools');
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm --workspace @maka/ui test`

Expected: helpers do not accept/consume an explicit locale and source still imports `detectUiLocale`.

- [ ] **Step 3: Replace detection with context/parameters**

Use `useUiLocale()` at React component boundaries. Pass `UiLocale` into pure helpers. Convert existing catalog declarations to `UiCatalog<...>` so both keys are compile-time required. Pass locale into core timestamp functions and UI absolute/clock formatters. Update isolated component tests to render inside `LocaleProvider preference="auto"`.

- [ ] **Step 4: Run UI tests and typecheck**

Run: `npm --workspace @maka/ui test`

Run: `npm --workspace @maka/ui run typecheck`

Expected: both commands pass and `rg -n "detectUiLocale" packages/ui/src` returns no matches.

- [ ] **Step 5: Commit**

Commit message: `refactor(ui): consume locale from React context`

### Task 5: Wire desktop persisted preference and visual override into React state

**Files:**
- Create: `apps/desktop/src/main/__tests__/reactive-locale-foundation-contract.test.ts`
- Modify: `apps/desktop/src/renderer/app-shell.tsx`
- Modify: `apps/desktop/src/renderer/app-shell-visual-smoke.ts`
- Modify: `apps/desktop/src/renderer/app-shell-overlays.tsx`
- Modify: `apps/desktop/src/renderer/settings/SettingsModal.tsx`
- Modify: `apps/desktop/src/renderer/settings/settings-surface.tsx`
- Modify: `apps/desktop/src/renderer/settings/appearance-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/OnboardingHero.tsx`
- Modify: `apps/desktop/src/renderer/artifact-pane.tsx`
- Modify: `apps/desktop/src/renderer/theme.ts`
- Modify: existing desktop source-contract tests affected by the new state path

- [ ] **Step 1: Write failing desktop wiring tests**

Add contracts asserting:

- `AppShell` owns `uiLocalePreference` and `uiLocaleOverride` state;
- the whole renderer return is wrapped in `LocaleProvider`;
- startup settings hydrate preference state;
- visual smoke hydrates override state;
- successful settings updates notify the shell with `result.settings.personalization.uiLocale`;
- no settings path calls `applyUiLocale`;
- `OnboardingHero` and `ArtifactPane` consume `useUiLocale()`;
- the legacy duplicate type and `applyUiLocale()` implementation are removed from `theme.ts`.

- [ ] **Step 2: Run the targeted desktop test and verify RED**

Run: `npm --workspace @maka/desktop run build:main`

Run: `node --test apps/desktop/dist/main/__tests__/reactive-locale-foundation-contract.test.js`

Expected: source contract fails because locale is still applied only to DOM.

- [ ] **Step 3: Implement desktop state and provider wiring**

In `AppShell`:

```tsx
const [uiLocalePreference, setUiLocalePreference] = useState<UiLocalePreference>('auto');
const [uiLocaleOverride, setUiLocaleOverride] = useState<UiLocale | null>(null);

return (
  <LocaleProvider preference={uiLocalePreference} override={uiLocaleOverride}>
    {/* existing desktop tree */}
  </LocaleProvider>
);
```

Set both states in `refreshShellSettings()`. Pass `setUiLocaleOverride` into visual-smoke actions. Thread `onUiLocalePreferenceChange` alongside the existing theme callbacks through overlays, modal, and settings surface. Invoke it only after a current successful settings update and use the canonical value returned by the backend.

Delete `applyUiLocale` and the duplicate desktop preference type. Migrate `OnboardingHero` and `ArtifactPane` to the hook and explicit timestamp locale.

- [ ] **Step 4: Run desktop targeted tests and verify GREEN**

Run: `npm --workspace @maka/desktop run build:main`

Run: `node --test apps/desktop/dist/main/__tests__/reactive-locale-foundation-contract.test.js`

Expected: all new desktop locale contracts pass.

- [ ] **Step 5: Commit**

Commit message: `feat(desktop): wire reactive UI locale state`

### Task 6: Remove the parallel localization path and prove compile-time catalog coverage

**Files:**
- Modify: all remaining files reported by locale searches
- Modify: `apps/desktop/src/main/__tests__/personalization-sync-contract.test.ts`
- Modify: `apps/desktop/src/main/__tests__/renderer-startup-fail-soft-contract.test.ts`
- Modify: `apps/desktop/src/main/visual-smoke-fixture.ts` comments/contracts as needed

- [ ] **Step 1: Add failing absence/precedence assertions**

The desktop contract must reject these source patterns:

```ts
assert.doesNotMatch(rendererSource, /detectUiLocale/);
assert.doesNotMatch(rendererSource, /applyUiLocale/);
assert.doesNotMatch(rendererSource, /document\.documentElement.*makaLocale/);
```

It must assert `UiCatalog` usage for current catalogs and test override precedence through the core resolver/provider inputs.

- [ ] **Step 2: Run targeted tests and verify RED**

Run the new desktop contract and existing personalization/startup contracts.

Expected: stale contracts still expect `applyUiLocale` or remaining sources still reference DOM detection.

- [ ] **Step 3: Update remaining consumers and stale contracts**

Remove all remaining renderer/UI reads of locale DOM attributes, update comments to describe React state, and realign old source tests with the single preference -> state -> provider path. Keep visual-smoke DOM attributes only as provider-synchronized observable outputs.

- [ ] **Step 4: Run searches and targeted tests**

Run: `rg -n "detectUiLocale|applyUiLocale|type UiLocalePreference =" packages apps/desktop/src/renderer`

Expected: no legacy implementation matches; only canonical core exports/tests/documentation may mention the names.

Run the targeted core, UI, and desktop locale tests. Expected: all pass.

- [ ] **Step 5: Commit**

Commit message: `test(locale): enforce single reactive locale path`

### Task 7: Final verification and delivery audit

**Files:**
- Modify only files needed to fix verification failures caused by this branch.

- [ ] **Step 1: Run focused package tests**

Run:

```text
npm --workspace @maka/core test
npm --workspace @maka/ui test
npm --workspace @maka/desktop test
```

Expected: core and UI are fully green. Desktop feature-related tests are green; separately record any reproduced Windows-only baseline failures established before implementation.

- [ ] **Step 2: Run workspace typecheck and build**

Run: `npm run typecheck`

Run: `npm run build`

Expected: both exit 0.

- [ ] **Step 3: Run repository hygiene checks**

Run: `git diff --check upstream/main...HEAD`

Run: `git status --short`

Expected: no whitespace errors and only intentional changes.

- [ ] **Step 4: Audit every PR 1 requirement**

Confirm with source/test evidence:

- canonical core types and resolver;
- provider/hook public API;
- persisted preference enters React state;
- runtime switching is reactive;
- override > explicit > auto precedence;
- `auto -> zh` remains;
- `<html lang>` and Intl use the resolved locale;
- catalogs require zh/en at compile time;
- DOM detection and duplicate types are absent;
- CLI and later translation slices are untouched.

- [ ] **Step 5: Review branch diff and commit any verification-only fixes**

Run: `git diff --stat upstream/main...HEAD`

Run: `git log --oneline upstream/main..HEAD`

Expected: a focused PR 1 diff with small, intentional commits and no generated artifacts.
