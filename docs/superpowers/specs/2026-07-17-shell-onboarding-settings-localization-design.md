# Shell, Onboarding, and Settings Localization Design

## Scope

This change implements PR 2 from issue #1052. It translates the complete desktop journey from launch through onboarding and Settings, including the shell controls needed to enter Settings, find the language preference, switch language without reloading, navigate every Settings section, and switch back without encountering untranslated shell controls.

The migrated surface includes:

- desktop navigation, command palette, keyboard help, first-run checklist, onboarding states, and setup actions;
- Settings navigation, page titles/descriptions, all enabled Settings pages, dialogs, empty/loading/error states, form labels, placeholders, tooltips, toasts, and accessibility labels;
- shared `@maka/ui` controls reached by that journey, such as search/navigation chrome and generic dialog/status labels;
- pure presentation and error-copy helpers called by those surfaces.

Conversation, session, permission, and tool-result copy remain PR 3. CLI localization, extra locales, user/model/generated content, and translation-platform infrastructure remain out of scope.

PR 2 deliberately preserves `auto -> zh`. System-language resolution remains PR 4 work, after the remaining desktop coverage and completion gate are in place, so an intermediate release cannot expose a mixed-language surface.

## Architecture

### One resolved locale at the desktop root

`personalization.uiLocale` remains the only persisted preference. `AppShell` combines that preference with the visual-test override through `resolveUiLocale()` exactly once and stores the result in a local `uiLocale` value. `LocaleProvider` is narrowed to publish an already-resolved `locale` rather than resolving preference inputs itself.

This gives both React consumers and AppShell's asynchronous action factories the same value:

```text
persisted preference + test override
              |
              v
     resolveUiLocale() once
              |
              +--> LocaleProvider(locale) --> useUiLocale()
              |
              +--> pure toast/action copy helpers(locale)
```

`<html lang>`, `data-maka-locale`, `Intl`, rendered copy, and action feedback therefore consume one resolved locale. There is no DOM-reading, module-global, local-storage, or duplicate React localization path.

The PR keeps the resolver's current `auto -> zh` policy. PR 2 and PR 3 do not add a system-language input.

### Typed catalogs owned by the presenting layer

Copy stays with the layer that presents it:

- desktop product copy lives under `apps/desktop/src/renderer/locales/`;
- shared component copy lives under `packages/ui/src/locales/`;
- pure helpers accept `UiLocale` explicitly and select from a `UiCatalog<T>`;
- React components call `useUiLocale()` at their boundary and pass the locale to pure helpers.

Catalogs are grouped by user journey rather than placed in one giant object:

- desktop: `shell`, `onboarding`, `settings-navigation`, and focused Settings domain catalogs;
- shared UI: only the generic controls actually reached by PR 2.

Every catalog is declared as `satisfies UiCatalog<Shape>` (or explicitly typed as `UiCatalog<Shape>`). Chinese and English therefore share one compile-time shape; no lookup may use `catalog[locale] ?? catalog.zh`, and missing English copy is a type error.

Dynamic values such as provider names, paths, versions, model identifiers, user-entered labels, and error details are interpolated into localized templates but are never translated.

### Settings navigation and page ownership

`SETTINGS_NAV` becomes locale-neutral metadata: ids, icons, enabled state, group identity, and badges. Labels, group labels, page descriptions, and page headings are selected from a typed locale catalog. `groupedNav(locale)` and other pure navigation helpers receive `UiLocale` explicitly.

Each Settings page owns its page-specific catalog near its view model or in a focused locale module. Large domains such as providers, memory, remote access, permissions, and gateway do not share an untyped string bag. Cross-page phrases such as Save, Cancel, Retry, Loading, Copy, and status/accessibility labels use a small shared Settings catalog.

Error classifiers keep their existing sanitization boundaries. They localize the safe fallback and classification label while preserving already-sanitized dynamic details.

### Runtime language switching

The appearance page continues to persist through the existing locale update gate. On a successful write:

1. the one persisted preference changes;
2. `AppShell` recomputes `uiLocale`;
3. `LocaleProvider` publishes the new resolved locale;
4. all shell/onboarding/Settings consumers rerender immediately;
5. `<html lang>` and locale-sensitive `Intl` output update from the same value.

A failed or superseded write does not change the active locale. Visual-smoke overrides retain highest precedence and clearing an override reveals the persisted preference.

## Error handling

- Unknown persisted preferences continue to normalize to `auto` at the settings boundary.
- Missing `LocaleProvider` remains an actionable test/runtime error rather than silently choosing Chinese.
- Settings and shell action errors keep secret/path redaction before localized formatting.
- Dynamic provider, account, path, version, and model text is preserved verbatim.
- Unsupported or unclassified failures use locale-specific safe fallback copy; raw exception text is not promoted into translated UI.

## Testing and migration gate

Tests are written before each migration and cover:

- `LocaleProvider` publishing a resolved locale and synchronizing document attributes;
- a single desktop resolver result feeding provider and action-copy helpers;
- complete catalog shapes and explicit locale parameters on pure helpers;
- every onboarding state and setup step in Chinese and English;
- every Settings navigation item/group/description in Chinese and English;
- representative rendering of every enabled Settings section under both locales;
- runtime English -> Chinese -> English switching without remount/reload;
- successful persistence, failed persistence, and visual-smoke override precedence;
- localized placeholders, tooltips, toast fallbacks, dialog actions, and accessibility labels used by the journey;
- preservation of brands, paths, model ids, versions, user content, and sanitized error details.

A PR-2 coverage contract maintains an explicit manifest of migrated source files and scans TypeScript string/JSX literals (not comments) for unapproved CJK literals. Deliberate user/generated-content fixtures and non-user-visible identifiers require a reasoned allowlist entry. The gate applies only to the PR-2 surface; PR 3 expands it to conversation/session/tool files.

Desktop E2E coverage launches the fake backend, exercises first-run and Settings navigation in English, changes to Chinese and back, asserts `<html lang>`, and verifies that representative shell controls remain coherent without a reload.

## Delivery boundary

PR 2 is based on the latest upstream `main` and is independently buildable and testable. It leaves the conversation journey in Chinese when `auto` is selected, because `auto -> zh` remains intentional through PR 2 and PR 3. PR 3 will migrate conversation/session/tool copy and extend the inline-copy gate; system-language resolution, remaining surfaces, and the final issue-level completion audit remain PR 4.
