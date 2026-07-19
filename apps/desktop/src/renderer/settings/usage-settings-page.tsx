import { useMemo, useState, type ReactNode } from 'react';
import { uiLocaleToIntlLocale, type AppSettings, type UiLocale, type UpdateAppSettingsResult, type UsageRange, type UsageStats } from '@maka/core';
import { Button, Input, Segmented, SettingsSelect, SettingsSwitch as Switch, useToast, useUiLocale } from '@maka/ui';
import { getUsageSettingsCopy, type UsageSettingsCopy } from '../locales/settings-usage-copy';
import { RefreshCcw } from '@maka/ui/icons';
import { MetricCard } from './settings-metric-card';
import { settingsActionErrorMessage } from './settings-error-copy';
import { useActionGuard } from './use-action-guard';
import { useOptimisticSettingsDraft } from './use-optimistic-settings-draft';

export function UsageSettingsPage(props: {
  settings: AppSettings;
  stats: UsageStats | null;
  onUpdate(patch: Parameters<typeof window.maka.settings.update>[0]): Promise<UpdateAppSettingsResult>;
  onReload(range?: UsageRange): Promise<void>;
  onOpenSession?(sessionId: string): void;
}) {
  const locale = useUiLocale();
  const copy = getUsageSettingsCopy(locale);
  const persistedUsage = props.settings.usage;
  const [refreshing, setRefreshing] = useState(false);
  const usageRefreshGuard = useActionGuard<'refresh'>();
  const stats = props.stats;
  const toast = useToast();
  const {
    draft: usageDraft,
    draftRef: usageDraftRef,
    mountedRef: usagePageMountedRef,
    update,
  } = useOptimisticSettingsDraft<AppSettings['usage']>(
    persistedUsage,
    (patch) => props.onUpdate({ usage: patch }).then((result) => result.settings.usage),
    { onError: (error) => toast.error(copy.saveFailed, settingsActionErrorMessage(error, locale)) },
  );

  const normalizedModelFilter = usageDraft.modelFilter.trim().toLowerCase();
  const hasRequestFilters = usageDraft.status !== 'all' || normalizedModelFilter.length > 0;
  const showRequestDetails = usageDraft.activeTab === 'requests' && usageDraft.showDetails;
  const filteredLogs = useMemo(() => {
    const logs = stats?.logs ?? [];
    return logs
      .filter((log) => usageDraft.status === 'all' || log.status === usageDraft.status)
      .filter((log) =>
        normalizedModelFilter.length === 0 ||
        log.model.toLowerCase().includes(normalizedModelFilter) ||
        (log.toolName ?? '').toLowerCase().includes(normalizedModelFilter)
      );
  }, [stats, usageDraft.status, normalizedModelFilter]);

  async function setRange(range: UsageRange) {
    const saved = await updateUsage({ range });
    if (!saved || !usagePageMountedRef.current) return;
    await props.onReload(range);
  }

  function updateUsage(patch: Partial<AppSettings['usage']>): Promise<boolean> {
    return update(patch);
  }

  async function refresh() {
    if (!usageRefreshGuard.begin('refresh')) return;
    setRefreshing(true);
    try {
      await props.onReload(usageDraftRef.current.range);
    } finally {
      usageRefreshGuard.finish();
      if (usagePageMountedRef.current) {
        setRefreshing(false);
      }
    }
  }

  function clearRequestFilters() {
    void updateUsage({ status: 'all', modelFilter: '' });
  }

  return (
    <div className="settingsUsagePage">
      <div className="settingsUsageToolbar" role="group" aria-label={copy.toolbarAria}>
        <Segmented
          value={usageDraft.range}
          ariaLabel={copy.rangeAria}
          options={[
            ['24h', copy.ranges[0]],
            ['7d', copy.ranges[1]],
            ['30d', copy.ranges[2]],
            ['all', copy.ranges[3]],
          ]}
          onChange={(value) => void setRange(value as UsageRange)}
        />
        {/* Detail audit: 刷新 was a primary --action chip glued to the
            segmented — two control styles fighting in one row for a
            low-frequency utility. Same quiet icon form as the automations
            page refresh (one action, one shape everywhere). */}
        <Button
          type="button"
          variant="quiet"
          size="icon-sm"
          disabled={refreshing}
          aria-busy={refreshing}
          data-pending={refreshing ? 'true' : undefined}
          aria-label={refreshing ? copy.refreshingAria : copy.refreshAria}
          title={refreshing ? copy.refreshingAria : copy.refreshAria}
          onClick={() => void refresh()}
        >
          <RefreshCcw size={15} aria-hidden="true" />
        </Button>
      </div>

      <div className="settingsUsageSummary" role="group" aria-label={copy.summaryAria}>
        <MetricCard title={copy.totalRequests} value={String(stats?.summary.totalRequests ?? 0)} />
        <MetricCard title={copy.totalCost} value={`$${(stats?.summary.totalCostUsd ?? 0).toFixed(2)}`} detail={copy.costHelp} />
        <MetricCard title={copy.totalTokens} value={String(stats?.summary.totalTokens ?? 0)} detail={copy.tokenDetail(stats?.summary.inputTokens ?? 0, stats?.summary.outputTokens ?? 0)} />
        <MetricCard title={copy.cacheTokens} value={String(stats?.summary.cacheTokens ?? 0)} detail={copy.cacheDetail(stats?.summary.cacheMiss ?? 0, stats?.summary.cacheRead ?? 0, stats?.summary.cacheCreation ?? 0)} />
      </div>

      <Segmented
        value={usageDraft.activeTab}
        ariaLabel={copy.viewAria}
        options={[
          ['requests', copy.tabs[0]],
          ['providers', copy.tabs[1]],
          ['models', copy.tabs[2]],
          ['tools', copy.tabs[3]],
          ['pricing', copy.tabs[4]],
        ]}
        onChange={(activeTab) => void updateUsage({ activeTab: activeTab as typeof usageDraft.activeTab })}
      />

      {showRequestDetails && (
        <div className="settingsUsageFilters" role="group" aria-label={copy.filtersAria}>
          <Input value={usageDraft.modelFilter} onChange={(event) => void updateUsage({ modelFilter: event.currentTarget.value })} placeholder={copy.filterPlaceholder} aria-label={copy.filterAria} />
          <SettingsSelect
            value={usageDraft.status}
            ariaLabel={copy.statusAria}
            options={[
              ['all', copy.statuses[0]],
              ['success', copy.statuses[1]],
              ['error', copy.statuses[2]],
            ] satisfies Array<readonly [typeof usageDraft.status, string]>}
            onChange={(status) => void updateUsage({ status })}
          />
          <label className="settingsUsageDetailToggle">
            <span>{copy.details}</span>
            <Switch
              ariaLabel={copy.detailsAria}
              checked={usageDraft.showDetails}
              onChange={(showDetails) => void updateUsage({ showDetails })}
            />
          </label>
          <small className="settingsUsageRecordCount">{copy.recordCount(filteredLogs.length)}</small>
          <Button
            className="settingsUsageClearFilter"
            type="button"
            variant="ghost"
            size="sm"
            disabled={!hasRequestFilters}
            aria-hidden={!hasRequestFilters ? 'true' : undefined}
            tabIndex={!hasRequestFilters ? -1 : undefined}
            onClick={hasRequestFilters ? clearRequestFilters : undefined}
          >
            {copy.clearFilters}
          </Button>
        </div>
      )}

      {usageDraft.activeTab === 'requests' && !usageDraft.showDetails ? (
        <div className="settingsNotice">
          {copy.summaryOnly}
          <div className="settingsActionRow settingsNoticeAction">
            <Button type="button" variant="secondary" size="sm" onClick={() => void updateUsage({ showDetails: true })}>
              {copy.showDetails}
            </Button>
          </div>
        </div>
      ) : (
        <UsageTable
          activeTab={usageDraft.activeTab}
          stats={stats}
          logs={showRequestDetails ? filteredLogs : []}
          requestEmpty={hasRequestFilters ? copy.filteredEmpty : copy.requestEmpty}
          copy={copy}
          locale={locale}
          onOpenSession={props.onOpenSession}
        />
      )}
    </div>
  );
}

function UsageTable(props: { activeTab: AppSettings['usage']['activeTab']; stats: UsageStats | null; logs: UsageStats['logs']; requestEmpty: string; copy: UsageSettingsCopy; locale: UiLocale; onOpenSession?(sessionId: string): void }) {
  if (props.activeTab === 'providers') {
    return <SimpleStatsTable ariaLabel={props.copy.tables.providersAria} headers={props.copy.tables.providerHeaders} rows={(props.stats?.byProvider ?? []).map((row) => [row.provider, row.requests, row.tokens, `$${row.costUsd.toFixed(2)}`])} empty={props.copy.requestEmpty} />;
  }
  if (props.activeTab === 'models') {
    return <SimpleStatsTable ariaLabel={props.copy.tables.modelsAria} headers={props.copy.tables.modelHeaders} rows={(props.stats?.byModel ?? []).map((row) => [row.model, row.requests, row.tokens, `$${row.costUsd.toFixed(2)}`])} empty={props.copy.requestEmpty} />;
  }
  if (props.activeTab === 'tools') {
    return <SimpleStatsTable ariaLabel={props.copy.tables.toolsAria} headers={props.copy.tables.toolHeaders} rows={(props.stats?.byTool ?? []).map((row) => [row.tool, row.calls, row.success, row.errors, `${row.avgDurationMs}ms`])} empty={props.copy.requestEmpty} />;
  }
  if (props.activeTab === 'pricing') {
    return <SimpleStatsTable ariaLabel={props.copy.tables.pricingAria} headers={props.copy.tables.pricingHeaders} rows={(props.stats?.pricing ?? []).map((row) => [row.provider, row.model, `$${row.inputPerMTokUsd}`, `$${row.outputPerMTokUsd}`])} empty={props.copy.tables.noPricing} />;
  }
  return <SimpleStatsTable ariaLabel={props.copy.tables.requestsAria} headers={props.copy.tables.requestHeaders} rows={props.logs.map((row) => [new Date(row.ts).toLocaleString(uiLocaleToIntlLocale(props.locale)), usageRequestKindLabel(row.kind, props.copy), usageRequestTarget(row), usageRequestSessionCell(row, props.copy, props.onOpenSession), row.inputTokens + row.outputTokens, row.kind === 'model' ? `$${(row.costUsd ?? 0).toFixed(2)}` : '-', row.latencyMs ? `${row.latencyMs}ms` : '-', usageRequestStatusLabel(row.status, props.copy)])} empty={props.requestEmpty} />;
}

function usageRequestKindLabel(kind: UsageStats['logs'][number]['kind'], copy: UsageSettingsCopy) {
  switch (kind) {
    case 'model': return copy.tables.modelKind;
    case 'tool': return copy.tables.toolKind;
  }
}

function usageRequestTarget(row: UsageStats['logs'][number]) {
  return row.kind === 'tool' ? row.toolName ?? row.model : row.model;
}

function usageRequestSessionCell(row: UsageStats['logs'][number], copy: UsageSettingsCopy, onOpenSession?: (sessionId: string) => void) {
  const label = shortUsageSessionId(row.sessionId);
  if (!onOpenSession) return label;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => onOpenSession(row.sessionId)}>
      {copy.tables.openSession(label)}
    </Button>
  );
}

function shortUsageSessionId(sessionId: string) {
  return sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
}

function usageRequestStatusLabel(status: UsageStats['logs'][number]['status'], copy: UsageSettingsCopy) {
  switch (status) {
    case 'success': return copy.tables.success;
    case 'error': return copy.tables.error;
  }
}

function SimpleStatsTable(props: { ariaLabel: string; headers: readonly string[]; rows: Array<Array<ReactNode>>; empty: string }) {
  // Local table styles reproduce the retired Table primitive (now removed — a
  // single consumer did not justify a public primitive). Values are inline so
  // the stats surface stays self-contained until a second HTML <table> consumer
  // appears, at which point this can lift back to packages/ui.
  const headClass = "border-b border-border px-[var(--space-2)] py-[var(--space-1)] text-left align-middle font-semibold text-foreground-secondary [font-variant-numeric:tabular-nums]";
  const cellClass = "border-b border-border px-[var(--space-2)] py-[var(--space-1)] text-left align-middle text-foreground-secondary [font-variant-numeric:tabular-nums]";
  return (
    <table
      aria-label={props.ariaLabel}
      className="w-full border-collapse overflow-hidden rounded-[var(--radius-surface)] border border-border text-[length:var(--font-size-caption)]"
    >
      <thead>
        <tr>{props.headers.map((header) => <th key={header} scope="col" className={headClass}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {props.rows.length === 0 ? (
          <tr><td colSpan={props.headers.length} className={cellClass}>{props.empty}</td></tr>
        ) : props.rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              cellIndex === 0 ? (
                <th key={cellIndex} scope="row" className={headClass}>{cell}</th>
              ) : (
                <td key={cellIndex} className={cellClass}>{cell}</td>
              )
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
