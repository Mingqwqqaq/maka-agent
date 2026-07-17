# Shell, Onboarding, and Settings Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue #1052 PR 2 so the complete shell, onboarding, and Settings journey renders coherently in Chinese and English and switches at runtime without reload.

**Architecture:** Desktop resolves one `UiLocale` from the persisted preference and test override, then publishes that resolved value through `LocaleProvider` and passes it to pure action-copy helpers. Typed journey catalogs live with their presenting layer, React boundaries consume `useUiLocale()`, pure helpers require an explicit locale, and a TypeScript-AST source contract prevents migrated components from reintroducing inline Chinese copy.

**Tech Stack:** TypeScript 5.9, React 19, Electron, Node test runner, Playwright, npm workspaces, Biome, Knip.

---

### Task 1: Make the desktop own exactly one resolved locale

**Files:**
- Modify: `packages/ui/src/locale-context.tsx`
- Modify: `packages/ui/src/__tests__/locale-context.test.tsx`
- Modify: `apps/desktop/src/renderer/app-shell.tsx`
- Modify: `apps/desktop/src/main/__tests__/reactive-locale-foundation-contract.test.ts`
- Modify: desktop/UI SSR tests that construct `LocaleProvider`

- [ ] **Step 1: Write failing provider and desktop authority tests**

Change the provider tests to use the wished-for resolved-locale API:

```tsx
assert.equal(renderToStaticMarkup(
  <LocaleProvider locale="en"><Probe /></LocaleProvider>,
), '<span>en</span>');
```

Extend the desktop source contract with:

```ts
assert.match(appShell, /const uiLocale = resolveUiLocale\(uiLocalePreference, uiLocaleOverride\)/);
assert.match(appShell, /<LocaleProvider locale=\{uiLocale\} override=\{uiLocaleOverride\}>/);
assert.equal((appShell.match(/resolveUiLocale\(/g) ?? []).length, 1);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm --workspace @maka/ui run build
npm --workspace @maka/desktop run build:main
node --test packages/ui/dist/__tests__/locale-context.test.js apps/desktop/dist/main/__tests__/reactive-locale-foundation-contract.test.js
```

Expected: compilation or assertions fail because `LocaleProvider` still accepts preference inputs and AppShell does not own a resolved `uiLocale`.

- [ ] **Step 3: Publish an already-resolved locale**

Implement the provider boundary as:

```tsx
export function LocaleProvider(props: {
  locale: UiLocale;
  override?: UiLocale | null;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    syncUiLocaleDocument(props.locale, props.override);
  }, [props.locale, props.override]);
  return <UiLocaleContext.Provider value={props.locale}>{props.children}</UiLocaleContext.Provider>;
}
```

In AppShell derive once:

```ts
const uiLocale = resolveUiLocale(uiLocalePreference, uiLocaleOverride);
```

Pass `uiLocale` to the provider and to pure AppShell action-copy factories. Update test wrappers from `preference="zh"` to `locale="zh"`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 commands. Expected: both suites pass and the source contract finds one resolver call.

- [ ] **Step 5: Commit**

```powershell
git add packages/ui/src apps/desktop/src
git commit -m "refactor(locale): resolve desktop locale once"
```

### Task 2: Add a reusable migrated-copy source contract

**Files:**
- Create: `apps/desktop/src/main/__tests__/localized-source-contract-helpers.ts`
- Create: `apps/desktop/src/main/__tests__/pr2-localized-copy-contract.test.ts`
- Modify: `apps/desktop/tsconfig.main.json` only if the helper needs an explicit include

- [ ] **Step 1: Write a failing AST-based contract**

Create a helper that parses TypeScript/TSX with `typescript`, visits `StringLiteral`, `NoSubstitutionTemplateLiteral`, and non-whitespace `JsxText`, and reports literals containing `/[\u3400-\u9fff]/`. Catalog files are allowed to contain Chinese; migrated presentation files are not.

The PR-2 manifest initially includes:

```ts
export const PR2_PRESENTATION_FILES = [
  'apps/desktop/src/renderer/FirstRunChecklist.tsx',
  'apps/desktop/src/renderer/OnboardingHero.tsx',
  'apps/desktop/src/renderer/command-palette.tsx',
  'apps/desktop/src/renderer/keyboard-help.tsx',
  'apps/desktop/src/renderer/settings/SettingsModal.tsx',
  'apps/desktop/src/renderer/settings/settings-surface.tsx',
] as const;
```

The test fails with `file:line: literal` diagnostics and rejects `catalog[locale] ?? catalog.zh` throughout migrated catalog modules.

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
npm --workspace @maka/desktop run build:main
node --test apps/desktop/dist/main/__tests__/pr2-localized-copy-contract.test.js
```

Expected: the test lists existing inline Chinese copy in the initial manifest.

- [ ] **Step 3: Keep the contract strict and auditable**

Implement reasoned exemptions as exact tuples rather than regex-wide skips:

```ts
type LiteralExemption = {
  file: string;
  text: string;
  reason: 'test-fixture' | 'non-user-visible-protocol' | 'brand';
};
```

Do not exempt user-visible copy. Add files to the manifest only in the same commit that removes their inline user-visible Chinese.

- [ ] **Step 4: Verify the helper's negative and positive cases**

Unit-test one inline JSX Chinese label (reported), one comment (ignored), one catalog file (allowed), one protocol marker exemption (allowed), and an English literal (ignored).

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/main/__tests__
git commit -m "test(locale): gate migrated PR2 copy"
```

### Task 3: Localize desktop shell navigation and action feedback

**Files:**
- Create: `apps/desktop/src/renderer/locales/shell-copy.ts`
- Create: `apps/desktop/src/main/__tests__/shell-copy.test.ts`
- Modify: `apps/desktop/src/renderer/app-shell.tsx`
- Modify: `apps/desktop/src/renderer/app-shell-copy.ts`
- Modify: `apps/desktop/src/renderer/app-shell-command-actions.ts`
- Modify: `apps/desktop/src/renderer/app-shell-chrome-actions.tsx`
- Modify: `apps/desktop/src/renderer/app-shell-project-actions.ts`
- Modify: `apps/desktop/src/renderer/app-shell-skill-actions.ts`
- Modify: `apps/desktop/src/renderer/app-shell-session-row-actions.ts`
- Modify: `apps/desktop/src/renderer/command-palette.tsx`
- Modify: `apps/desktop/src/renderer/command-palette-commands.ts`
- Modify: `apps/desktop/src/renderer/keyboard-help.tsx`
- Modify: `apps/desktop/src/renderer/FirstRunChecklist.tsx`
- Modify: `apps/desktop/src/renderer/error-boundary.tsx`
- Modify: `packages/ui/src/search-modal.tsx`
- Modify: `packages/ui/src/session-sidebar-nav.tsx`
- Add/modify focused desktop and UI tests for those components/helpers

- [ ] **Step 1: Write failing bilingual shell-copy tests**

Define a typed shell catalog whose shape includes navigation, command palette, keyboard help, first-run checklist, safe action failures, toast actions, placeholders, titles, and ARIA labels. Assert representative exact values:

```ts
assert.equal(getShellCopy('zh').navigation.settings, '设置');
assert.equal(getShellCopy('en').navigation.settings, 'Settings');
assert.equal(getShellCopy('en').actions.retry, 'Retry');
assert.equal(getShellCopy('en').commandPalette.placeholder, 'Search commands and content…');
```

Add pure-helper tests showing `messageReadErrorMessage(error, 'en')`, `openPathActionErrorMessage(error, key, 'en')`, and command builders return English safe copy without translating dynamic paths or names.

- [ ] **Step 2: Run focused shell tests and verify RED**

Run UI build plus the new pure tests and existing command-palette/AppShell contracts. Expected: missing catalog exports and old locale-free helper signatures fail.

- [ ] **Step 3: Implement shell catalog selection**

Declare:

```ts
const SHELL_COPY_BY_LOCALE = {
  zh: { navigation: { settings: '设置' }, actions: { retry: '重试' } },
  en: { navigation: { settings: 'Settings' }, actions: { retry: 'Retry' } },
} satisfies UiCatalog<ShellCopy>;

export function getShellCopy(locale: UiLocale): ShellCopy {
  return SHELL_COPY_BY_LOCALE[locale];
}
```

Use `useUiLocale()` in React boundaries. Thread the root `uiLocale` into AppShell action factories and every pure formatter. Preserve brands, shortcut key names, paths, project names, versions, and command/model identifiers.

- [ ] **Step 4: Expand the PR-2 manifest and verify GREEN**

Add every migrated file above to `PR2_PRESENTATION_FILES`. Run the new source contract, focused tests, `@maka/ui` typecheck, and desktop main build. Expected: no inline Chinese diagnostics and all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src packages/ui/src
git commit -m "feat(locale): translate desktop shell controls"
```

### Task 4: Localize every onboarding state and setup action

**Files:**
- Create: `apps/desktop/src/renderer/locales/onboarding-copy.ts`
- Modify: `apps/desktop/src/renderer/onboarding-hero-copy.ts`
- Modify: `apps/desktop/src/renderer/OnboardingHero.tsx`
- Modify: `apps/desktop/src/renderer/first-run-task-suggestions.ts`
- Modify: `apps/desktop/src/renderer/use-onboarding-snapshot.ts`
- Modify: `apps/desktop/src/main/__tests__/onboarding-hero-copy.test.ts`
- Modify: onboarding render/contract tests

- [ ] **Step 1: Write failing exhaustive zh/en onboarding tests**

For every `OnboardingState` variant, call `getOnboardingHeroCopy(state, locale)` and `getOnboardingSetupSteps(state, locale)`. Assert that English outputs contain no CJK, Chinese outputs retain product copy, `ready_with_history` returns `null`, and `connectionSlug` remains byte-identical.

```ts
assert.equal(getOnboardingHeroCopy({ kind: 'needs_connection' }, 'en')?.cta.label, 'Open Settings · Models');
assert.equal(getOnboardingHeroCopy({ kind: 'ready_with_history' }, 'en'), null);
```

- [ ] **Step 2: Run onboarding tests and verify RED**

Run desktop main build and onboarding suites. Expected: helper signatures accept no locale and return Chinese for English cases.

- [ ] **Step 3: Implement the typed onboarding catalog**

Move all eyebrow/title/body/CTA/setup-step/task-suggestion/ARIA copy into a catalog declared with `satisfies UiCatalog<OnboardingCatalog>`. Keep the exhaustive state switch; it selects templates from the locale catalog and interpolates only the allowed slug.

- [ ] **Step 4: Render both locales and verify GREEN**

Render each state inside `LocaleProvider locale="zh"` and `locale="en"`. Assert the English setup journey, CTA labels, quick-chat lead-in, and accessibility labels. Expand the source manifest and run the source contract.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/renderer apps/desktop/src/main/__tests__
git commit -m "feat(locale): translate onboarding journey"
```

### Task 5: Localize the Settings frame, navigation, and shared controls

**Files:**
- Create: `apps/desktop/src/renderer/locales/settings-shared-copy.ts`
- Create: `apps/desktop/src/renderer/locales/settings-navigation-copy.ts`
- Modify: `apps/desktop/src/renderer/settings/settings-nav.ts`
- Modify: `apps/desktop/src/renderer/settings/nav-group-summary.ts`
- Modify: `apps/desktop/src/renderer/settings/SettingsModal.tsx`
- Modify: `apps/desktop/src/renderer/settings/settings-surface.tsx`
- Modify: `apps/desktop/src/renderer/settings/settings-skeleton.tsx`
- Modify: `apps/desktop/src/renderer/settings/settings-error-copy.ts`
- Modify: `apps/desktop/src/renderer/settings/settings-metric-card.tsx`
- Modify: `packages/ui/src/primitives/dialog-header.tsx`
- Modify: `packages/ui/src/primitives/page-header.tsx`
- Modify: `packages/ui/src/primitives/section-header.tsx`
- Add/modify Settings navigation/frame tests

- [ ] **Step 1: Write failing navigation-shape and render tests**

Assert all `SettingsSection` ids have zh/en label and description entries, navigation groups are translated, badge values remain brands, and rendered English Settings chrome includes `Settings`, `Search settings`, `Close settings`, `Loading`, and `Try again` with no CJK.

- [ ] **Step 2: Run focused Settings frame tests and verify RED**

Expected: `SETTINGS_NAV` is Chinese-only and shared primitives expose inline Chinese fallback labels.

- [ ] **Step 3: Separate locale-neutral metadata from copy**

Keep ids/icons/enabled/group ids in `settings-nav.ts`; select labels/descriptions/group display names with `settingsNavigationCopy(locale)`. Require `groupedNav(locale)`. Shared Settings copy must include explicit Save/Cancel/Close/Back/Retry/Loading/Copy/Copied/Failed and accessibility variants in both locales.

- [ ] **Step 4: Verify frame switching without remount**

Use a rerender test that changes provider locale `en -> zh -> en`, keeps the selected Settings section, and asserts frame/nav text changes while the section id remains stable.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/renderer/settings apps/desktop/src/renderer/locales packages/ui/src
git commit -m "feat(locale): translate settings navigation"
```

### Task 6: Localize general, appearance, account, and about Settings

**Files:**
- Create: `apps/desktop/src/renderer/locales/settings-preferences-copy.ts`
- Modify: `apps/desktop/src/renderer/settings/general-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/appearance-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/account-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/account-auth-ui.ts`
- Modify: `apps/desktop/src/renderer/settings/about-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/password-input.tsx`
- Modify: `apps/desktop/src/renderer/theme.ts`
- Add/modify preference/account/about tests

- [ ] **Step 1: Write failing bilingual page and helper tests**

Cover page titles, descriptions, form labels, language/theme options, proxy and startup controls, account login/logout states, version/privacy copy, toast fallbacks, placeholders, show/hide-password labels, and ARIA text. Assert `auto`, `zh`, and `en` remain persisted values while their display labels are localized.

- [ ] **Step 2: Run focused tests and verify RED**

Expected: English provider renders Chinese page controls and pure account/theme helpers have no locale input.

- [ ] **Step 3: Implement preference catalogs and explicit helper locales**

Use `useUiLocale()` once per page. Pass `locale` to pure option builders and error classifiers. Keep theme ids, provider/account identifiers, platform names, URLs, and version strings unchanged.

- [ ] **Step 4: Verify runtime language persistence behavior**

Test successful `en -> zh` and `zh -> en` saves update the rendered page immediately, failed saves keep the prior language, and stale responses cannot overwrite the latest selection.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/renderer/settings apps/desktop/src/renderer/locales
git commit -m "feat(locale): translate preference settings"
```

### Task 7: Localize model/provider Settings and authentication flows

**Files:**
- Create: `apps/desktop/src/renderer/locales/settings-models-copy.ts`
- Modify: `apps/desktop/src/renderer/settings/ProvidersPanel.tsx`
- Modify: `apps/desktop/src/renderer/settings/provider-add-form.tsx`
- Modify: `apps/desktop/src/renderer/settings/provider-catalog.tsx`
- Modify: `apps/desktop/src/renderer/settings/provider-connection-detail.tsx`
- Modify: `apps/desktop/src/renderer/settings/provider-connection-status.ts`
- Modify: `apps/desktop/src/renderer/settings/provider-display-copy.ts`
- Modify: `apps/desktop/src/renderer/settings/provider-oauth-section.tsx`
- Modify: `apps/desktop/src/renderer/settings/provider-panel-shared.ts`
- Modify: `apps/desktop/src/renderer/settings/claude-subscription-card.tsx`
- Modify: `apps/desktop/src/renderer/settings/use-oauth-login-flow.ts`
- Add/modify provider display, form, OAuth, and connection tests

- [ ] **Step 1: Write failing provider journey tests in both locales**

Cover catalog browsing, add form, API-key and no-auth variants, connection detail, model selection, test/save/delete/default actions, OAuth login states, subscription status, and all safe error/toast copy. Assert provider/model names, endpoints, scopes, account ids, and error codes remain unchanged.

- [ ] **Step 2: Run provider tests and verify RED**

Expected: existing provider catalogs are only partially localized and English rendering contains inline Chinese controls.

- [ ] **Step 3: Complete typed provider and authentication catalogs**

Retain the existing `Record<ProviderType, UiCatalog<ProviderCopy>>` invariant. Add typed Settings action/state catalogs and require explicit locale on provider/auth pure helpers. Never fall back from English to Chinese.

- [ ] **Step 4: Verify all provider variants and source coverage**

Run every provider/connection/OAuth desktop test under both locales, expand the source manifest, and verify no migrated component literal is reported.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/renderer/settings apps/desktop/src/renderer/locales
git commit -m "feat(locale): translate model settings"
```

### Task 8: Localize integration and system Settings pages

**Files:**
- Create: `apps/desktop/src/renderer/locales/settings-integrations-copy.ts`
- Create: `apps/desktop/src/renderer/locales/settings-system-copy.ts`
- Modify: `apps/desktop/src/renderer/settings/usage-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/memory-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/memory-entry-list.tsx`
- Modify: `apps/desktop/src/renderer/settings/memory-settings-labels.ts`
- Modify: `apps/desktop/src/renderer/settings/memory-settings-sections.tsx`
- Modify: `apps/desktop/src/renderer/settings/memory-settings-view-model.ts`
- Modify: `apps/desktop/src/renderer/settings/use-memory-settings-controller.ts`
- Modify: `apps/desktop/src/renderer/settings/use-workspace-instructions-controller.ts`
- Modify: `apps/desktop/src/renderer/settings/daily-review-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/voice-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/open-gateway-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/bot-chat-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/bot-chat-overview.tsx`
- Modify: `apps/desktop/src/renderer/settings/bot-chat-detail.tsx`
- Modify: `apps/desktop/src/renderer/settings/bot-chat-shared.tsx`
- Modify: `apps/desktop/src/renderer/settings/bot-wechat-login.tsx`
- Modify: `apps/desktop/src/renderer/settings/web-search-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/data-settings-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/permission-center-page.tsx`
- Modify: `apps/desktop/src/renderer/settings/health-center-page.tsx`
- Add/modify focused tests for every page/controller/helper

- [ ] **Step 1: Write failing bilingual domain tests**

For each enabled section, cover title/description, empty/loading/success/error states, field labels/placeholders, destructive confirmations, copy buttons, status/count formatting, safe toast errors, and accessibility labels in zh/en. Preserve filenames, workspace paths, channel/provider brands, tokens, endpoint URLs, cron strings, model names, and user memory/instruction content.

- [ ] **Step 2: Run domain tests and verify RED**

Expected: English renders Chinese state/action labels across each listed page or controller.

- [ ] **Step 3: Implement focused integration/system catalogs**

Split catalog shapes by domain so each module remains reviewable. React pages select once with `useUiLocale()`. Controllers and view-model helpers receive `UiLocale` explicitly. Localized count/date formatting uses the existing resolved locale and `Intl`; no default locale parameter is added.

- [ ] **Step 4: Expand the source manifest and verify all Settings sections**

Run the AST contract plus each domain suite. Render the full Settings nav and every enabled section in both locales. Expected: no inline CJK diagnostics in migrated presentation files and no English catalog fallback.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/src/renderer/settings apps/desktop/src/renderer/locales apps/desktop/src/main/__tests__
git commit -m "feat(locale): translate integration settings"
```

### Task 9: Add the complete PR-2 runtime journey test

**Files:**
- Create: `apps/desktop/e2e/locale-shell-settings.spec.ts`
- Modify: `apps/desktop/src/main/visual-smoke-fixture.ts` only if an existing deterministic fixture selector is insufficient
- Modify: relevant E2E fixture helpers

- [ ] **Step 1: Write a failing Playwright journey**

The test must:

1. start on onboarding with English override or persisted English;
2. assert English shell and onboarding controls plus `html[lang="en"]`;
3. open Settings through the user-visible shell control;
4. traverse every enabled Settings nav item and assert its English heading/description;
5. choose Chinese and assert immediate Chinese shell/Settings copy plus `html[lang="zh"]` without page reload;
6. choose English again and assert the same selected Settings section remains open;
7. restart with persisted English and assert the preference survives;
8. assert representative brand/path/model/user values remain byte-identical.

- [ ] **Step 2: Run the E2E test and verify RED**

Run:

```powershell
Push-Location apps/desktop
npx playwright test --config e2e/playwright.config.ts e2e/locale-shell-settings.spec.ts
Pop-Location
```

Expected: the first untranslated shell/Settings assertion fails.

- [ ] **Step 3: Close only journey-specific gaps**

Migrate any missing PR-2 copy exposed by the E2E. Add those presentation files to the AST manifest in the same change. Do not translate conversation/session/tool output in this task.

- [ ] **Step 4: Run focused and full desktop E2E**

Run the new spec, then the full desktop E2E suite. Expected: all tests pass; visual-smoke overrides still outrank persistence.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/e2e apps/desktop/src
git commit -m "test(locale): cover shell settings switching"
```

### Task 10: Verify, review, publish, and monitor PR 2

**Files:**
- Modify: `docs/superpowers/plans/2026-07-17-shell-onboarding-settings-localization.md` to check completed steps
- Modify: PR description on GitHub after push

- [ ] **Step 1: Run the complete local CI-equivalent gate**

On Ubuntu + Node 22 run:

```bash
npm ci
npm run lint
npm run build
npm run typecheck
npx knip --workspace apps/desktop
npx knip --workspace packages/ui
npm run build:test
MAKA_REQUIRE_LINUX_SANDBOX_SMOKE=1 npm exec -w @maka/runtime -- node --test dist/__tests__/linux-sandbox-smoke.test.js
npm run test:dist
xvfb-run -a npm --workspace @maka/desktop run e2e
xvfb-run -a node scripts/audit-alignment.mjs
git diff --check upstream/main...HEAD
```

Expected: every command exits 0. Knip configuration hints are informational only; findings are not.

- [ ] **Step 2: Audit PR-2 requirements against evidence**

Verify each scope item has a catalog owner, zh/en render evidence, runtime switching evidence, persistence/failure evidence, AST coverage entry, and no translated user/model/brand/code content. Confirm `resolveUiLocale('auto') === 'zh'` remains unchanged.

- [ ] **Step 3: Perform a clean code review**

Inspect `git diff upstream/main...HEAD`, catalog shape consistency, helper signatures, async toast closures, stale-response behavior, accessibility labels, and source-contract exemptions. Fix findings with a failing regression test first.

- [ ] **Step 4: Push and open PR 2**

Push `feat/1052-shell-settings-localization` to the fork and open a PR against `maka-agent/maka-agent:main` titled:

```text
feat(desktop): localize shell onboarding and settings
```

The description lists the strict PR-2 boundary, `auto -> zh` preservation, catalog ownership, runtime switching test, non-goals, and all verification commands.

- [ ] **Step 5: Monitor GitHub CI to completion**

Wait for `typecheck`, `test`, and `e2e`. If a job fails, inspect the actual Actions log, reproduce under Ubuntu + Node 22, add a failing regression test, fix, rerun the complete affected gate, push, and monitor the replacement run until all checks succeed.
