import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath))
}

function listFiles(relativeDir) {
  const absoluteDir = path.join(rootDir, relativeDir)

  if (!fs.existsSync(absoluteDir)) {
    return []
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name).replaceAll("\\", "/")

    if (entry.isDirectory()) {
      if ([".nuxt", ".output", "dist", "node_modules", "assets"].includes(entry.name)) {
        continue
      }

      files.push(...listFiles(relativePath))
      continue
    }

    if (entry.isFile()) {
      files.push(relativePath)
    }
  }

  return files
}

const migration = "supabase/migrations/20260516192316_financial_accuracy_replace_reconciliation.sql"
const paginationIndexMigration = "supabase/migrations/20260516203000_statement_earnings_pagination_index.sql"
const dueAcceptanceMigration = "supabase/migrations/20260520110000_artist_due_acceptance.sql"
const csvDerivedAnalyticsMigration = "supabase/migrations/20260522120000_csv_derived_analytics_streams.sql"
const statementRollupMigration = "supabase/migrations/20260527082020_optimize_statement_earnings_rollups.sql"
const statementEarningsPayloadMigration = "supabase/migrations/20260528124500_optimize_statement_earnings_page_payload.sql"
const artistStatementsPayloadMigration = "supabase/migrations/20260528113000_optimize_artist_statements_payload.sql"
const walletLedgerMigration = "supabase/migrations/20260527085755_optimize_artist_wallet_ledger_view.sql"
const adminDashboardRollupMigration = "supabase/migrations/20260527094210_optimize_admin_dashboard_rollups.sql"
const catalogQueryIndexMigration = "supabase/migrations/20260527095951_add_catalog_query_indexes.sql"
const artistAnalyticsAudienceMigration = "supabase/migrations/20260527102638_optimize_artist_analytics_audience_raw_territory.sql"
const artistAnalyticsOverviewMigration = "supabase/migrations/20260527105450_optimize_artist_analytics_overview_rollups.sql"
const artistDashboardHomeAnalyticsMigration = "supabase/migrations/20260528093000_optimize_artist_dashboard_home_analytics.sql"
const adminEarningsSummaryMigration = "supabase/migrations/20260527112632_optimize_admin_earnings_summary.sql"
const adminEarningsFilterValuesMigration = "supabase/migrations/20260527114223_optimize_admin_earnings_filter_values.sql"
const adminEarningsPayloadMigration = "supabase/migrations/20260527143616_optimize_admin_earnings_payload.sql"
const adminEarningsPayloadRefineMigration = "supabase/migrations/20260527144051_refine_admin_earnings_payload_page_joins.sql"
const adminAnalyticsRevenueRowsMigration = "supabase/migrations/20260527123005_optimize_admin_analytics_revenue_rows.sql"
const csvDeleteUploadTotalMigration = "supabase/migrations/20260527125105_optimize_csv_delete_upload_total.sql"
const adminSettingsPayloadMigration = "supabase/migrations/20260527131022_optimize_admin_settings_payload.sql"
const artistWalletPayloadMigration = "supabase/migrations/20260527132754_optimize_artist_wallet_payload.sql"
const artistDashboardWalletPayloadMigration = "supabase/migrations/20260528101500_optimize_artist_dashboard_wallet_payload.sql"
const artistPayoutsPayloadMigration = "supabase/migrations/20260527134409_optimize_artist_payouts_payload.sql"
const adminPayoutsPayloadMigration = "supabase/migrations/20260528152000_optimize_admin_payouts_payload.sql"
const payoutServiceChargeDueRemovalMigration = "supabase/migrations/20260603203000_remove_payout_service_charge_due_link.sql"
const adminPublishingPayloadMigration = "supabase/migrations/20260528154500_optimize_admin_publishing_payload.sql"
const adminDuesPayloadMigration = "supabase/migrations/20260528161000_optimize_admin_dues_payload.sql"
const adminReconciliationPayloadMigration = "supabase/migrations/20260528163500_optimize_admin_reconciliation_payload.sql"
const adminArtistsPayloadMigration = "supabase/migrations/20260528170500_optimize_admin_artists_payload.sql"
const adminDashboardPayloadMigration = "supabase/migrations/20260527141712_optimize_admin_dashboard_payload.sql"
const artistNotificationsPayloadMigration = "supabase/migrations/20260527170500_optimize_artist_notifications_payload.sql"
const artistDashboardHomePayloadMigration = "supabase/migrations/20260527173500_optimize_artist_dashboard_home_payload.sql"
const artistReleasesListPayloadMigration = "supabase/migrations/20260528134500_optimize_artist_releases_list_payload.sql"
const permanentDeleteAdminAnalyticsMigration = "supabase/migrations/20260604210000_harden_permanent_delete_admin_analytics.sql"
const archiveArtistLifecycleMigration = "supabase/migrations/20260618120000_archive_artist_lifecycle.sql"
const archivedArtistManagementMigration = "supabase/migrations/20260618143000_archived_artist_management.sql"

const guardrails = [
  {
    file: "server/utils/payouts.ts",
    checks: [
      {
        label: "Tipalti service fee is never sent as a nonzero payout RPC amount",
        test: (source) =>
          /function resolvePayoutServiceChargeForRpc/.test(source)
          && /rpcServiceCharge:\s*"0\.00000000"/.test(source)
          && /function updatePayoutDisplayServiceCharge/.test(source),
      },
      {
        label: "Tipalti service fee persists only on payout_requests.service_charge",
        test: (source) =>
          /\.from\("payout_requests"\)[\s\S]*\.update\(\{\s*service_charge:\s*displayServiceCharge\s*\}\)/.test(source)
          && !/from\("admin_activity_log"\)/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/payouts/[id]/financials.patch.ts",
    checks: [
      {
        label: "admin payout financial edits pass only the safe Tipalti RPC value",
        test: (source) =>
          /resolvePayoutServiceChargeForRpc\(serviceCharge\)/.test(source)
          && /payout_service_charge:\s*serviceChargeResolution\.rpcServiceCharge/.test(source)
          && !/payout_service_charge:\s*serviceCharge[,}]/.test(source)
          && /updatePayoutDisplayServiceCharge\(supabase,\s*requestId,\s*serviceCharge\)/.test(source)
          && /service_charge:\s*serviceCharge/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/payouts/manual.post.ts",
    checks: [
      {
        label: "admin manual payouts pass only the safe Tipalti RPC value",
        test: (source) =>
          /resolvePayoutServiceChargeForRpc\(serviceCharge\)/.test(source)
          && /payout_service_charge:\s*serviceChargeResolution\.rpcServiceCharge/.test(source)
          && !/payout_service_charge:\s*serviceCharge[,}]/.test(source)
          && /updatePayoutDisplayServiceCharge\(supabase,\s*result\.requestId,\s*serviceCharge\)/.test(source)
          && /service_charge:\s*serviceCharge/.test(source),
      },
    ],
  },
  {
    file: payoutServiceChargeDueRemovalMigration,
    checks: [
      {
        label: "final payout service fee migration never creates service-charge dues",
        test: (source) =>
          /payout service fees are display-only fields on payout_requests/.test(source)
          && !/Manual payout service charge/.test(source)
          && !/Payout service charge/.test(source)
          && !/admin_manual_payout_service_charge/.test(source)
          && !/admin_payout_service_charge/.test(source)
          && !/insert into public\.dues/.test(source),
      },
    ],
  },
  {
    file: "app/components/DataTable.vue",
    checks: [
      {
        label: "pageSize prop changes reset TanStack pagination state",
        test: (source) => /watch\(\s*\(\)\s*=>\s*props\.pageSize[\s\S]*pageIndex:\s*0[\s\S]*pageSize/m.test(source),
      },
    ],
  },
  {
    file: "app/pages/dashboard/statements.vue",
    checks: [
      {
        label: "artist statement earnings page size options stay 10/50/100",
        test: (source) => /STATEMENT_EARNINGS_PAGE_SIZES\s*=\s*\[10,\s*50,\s*100\]/.test(source),
      },
      {
        label: "artist statement earnings do not expose hidden month filters",
        test: (source) =>
          /initializeStatementEarnings\(data\.value\)/.test(source)
          && /No active filters/.test(source)
          && !/filters\.period/.test(source)
          && !/periodMonth:\s*filters\./.test(source)
          && !/nextPeriodMonth\s*=\s*value\.defaultPeriodMonth/.test(source),
      },
      {
        label: "artist statement earnings use explicit server pagination controls",
        test: (source) =>
          /earningsPagination/.test(source)
          && /goToPreviousPage/.test(source)
          && /goToNextPage/.test(source)
          && !/enable-pagination/.test(source),
      },
      {
        label: "artist statement earnings export button stays hidden",
        test: (source) => !/earningsExportUrl/.test(source) && !/statement-export-link/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/statements.get.ts",
    checks: [
      {
        label: "artist statements summary uses one DB-side payload RPC",
        test: (source) =>
          /\.rpc\(\s*"get_artist_statements_payload"/.test(source)
          && /target_artist_ids:\s*artistIds/.test(source)
          && !/fetchAllPages/.test(source)
          && !/fetchAllByChunks/.test(source)
          && !/\.from\(/.test(source),
      },
      {
        label: "artist statement summary keeps earnings breakdown as compatibility-only empty field",
        test: (source) => /earningsBreakdownRows:\s*\[\]/.test(source) || /get_artist_statements_payload/.test(source),
      },
      {
        label: "artist statement summary returns a default statement period",
        test: (source) => /defaultPeriodMonth:\s*null/.test(source) && /get_artist_statements_payload/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/statements/earnings.get.ts",
    checks: [
      {
        label: "artist statement earnings endpoint uses one DB-side paged payload RPC",
        test: (source) =>
          /\.rpc\(\s*"get_statement_earnings_page_payload"/.test(source)
          && /target_artist_ids:\s*scope\.artistIds/.test(source)
          && /target_page:\s*filters\.page/.test(source)
          && /target_page_size:\s*filters\.pageSize/.test(source)
          && /normalizeStatementEarningsFilters/.test(source)
          && !/loadStatementEarningsPage/.test(source)
          && !/fetchAllPages/.test(source)
          && !/fetchAllByChunks/.test(source)
          && !/\.from\(/.test(source),
      },
      {
        label: "artist statement earnings endpoint preserves DSP logo keys after DB payload mapping",
        test: (source) =>
          /function addLogoKeys/.test(source)
          && /dspLogoKeyForName\(row\.channelName\)/.test(source)
          && /dspLogoKeyForName\(channel\.label\)/.test(source),
      },
    ],
  },
  {
    file: "server/utils/statement-earnings.ts",
    checks: [
      {
        label: "statement earnings rows are sourced from monthly earnings summary",
        test: (source) => /\.from\("monthly_earnings_summary"\)/.test(source) && !/\.from\("earnings"\)/.test(source),
      },
      {
        label: "statement earnings endpoint uses DB-side totals for pagination",
        test: (source) =>
          /\.rpc\(\s*"get_statement_earnings_totals"/.test(source)
          && /grouped_row_count/.test(source)
          && !/count:\s*"exact"/.test(source),
      },
      {
        label: "statement earnings endpoint ranges visible pages on the server",
        test: (source) => /\.range\(from,\s*to\)/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/statements/earnings/export.get.ts",
    checks: [
      {
        label: "statement earnings export streams all grouped filtered rows",
        test: (source) => /loadStatementEarningsRows/.test(source) && /text\/csv/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/analytics.get.ts",
    checks: [
      {
        label: "artist analytics overview API accepts range and advanced revenue filters",
        test: (source) =>
          /overviewPeriodRange\s*=\s*analyticsPeriodRangeFromQuery\(query\.overviewPeriodRange\)/.test(source)
          && /periodMonth:\s*(?:filterValueFromQuery|periodMonthFilterValueFromQuery)\(query\.periodMonth\)/.test(source)
          && /channelId:\s*filterValueFromQuery\(query\.channelId\)/.test(source)
          && /territory:\s*filterValueFromQuery\(query\.territory\)/.test(source)
          && /releaseId:\s*filterValueFromQuery\(query\.releaseId\)/.test(source)
          && /trackId:\s*filterValueFromQuery\(query\.trackId\)/.test(source),
      },
      {
        label: "artist analytics overview API pages DB-side revenue and publishing rollups",
        test: (source) =>
          /\.rpc\(\s*"get_artist_analytics_overview_rollups"/.test(source)
          && /target_period_start_month:\s*monthDateFromKey\(monthRange\?\.startMonth\)/.test(source)
          && /target_period_end_month:\s*monthDateFromKey\(monthRange\?\.endMonth\)/.test(source)
          && /target_release_id:\s*filters\.releaseId/.test(source)
          && /target_track_id:\s*filters\.trackId/.test(source)
          && /fetchAllPages<OverviewRollupRow>/.test(source)
          && /\.range\(from,\s*to\)/.test(source)
          && !/\.from\("monthly_earnings_summary"\)/.test(source)
          && !/\.from\("publishing_earnings"\)/.test(source),
      },
      {
        label: "artist analytics overview API returns chart-ready fields from rollups",
        test: (source) =>
          /metrics:\s*buildMetrics/.test(source)
          && /monthlyRevenue,/.test(source)
          && /countries,/.test(source)
          && /platformRows,/.test(source)
          && /platformSeries,/.test(source)
          && /releaseRows,/.test(source)
          && /filterOptions,/.test(source)
          && /earningsRows:\s*serializeRollupEarningsRows/.test(source)
          && /publishingRows:\s*publishingRows\.filter/.test(source)
          && /audienceSnapshots:\s*\[\]/.test(source),
      },
      {
        label: "artist analytics overview API does not fetch manual analytics snapshots",
        test: (source) => !/\.from\("analytics_snapshots"\)/.test(source),
      },
      {
        label: "artist analytics overview API supports a slim dashboard-home surface",
        test: (source) =>
          /surface\)\s*===\s*"dashboard_home"/.test(source)
          && /\.rpc\(\s*"get_artist_dashboard_home_analytics_rollups"/.test(source)
          && /platformSeries:\s*\[\]/.test(source)
          && /earningsRows:\s*\[\]/.test(source)
          && /publishingRows:\s*\[\]/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/analytics/audience.get.ts",
    checks: [
      {
        label: "artist analytics audience API filters CSV stream units server-side",
        test: (source) =>
          /audiencePeriodRange\s*=\s*analyticsPeriodRangeFromQuery\(query\.audiencePeriodRange\)/.test(source)
          && /\.rpc\(\s*"get_artist_analytics_audience_streams"/.test(source)
          && /target_release_id:\s*filters\.releaseId/.test(source)
          && /target_track_id:\s*filters\.trackId/.test(source)
          && /fetchAllPages<StreamRow>/.test(source)
          && /\.range\(from,\s*to\)/.test(source)
          && !/analytics_snapshots/.test(source),
      },
      {
        label: "artist analytics audience API returns ready-to-render stream cards",
        test: (source) =>
          /function buildStreamCards/.test(source)
          && /value:\s*latest\?\.\[1\]\s*\?\?\s*null/.test(source)
          && /delta/.test(source)
          && /periodLabel/.test(source)
          && /points/.test(source),
      },
    ],
  },
  {
    file: "app/pages/dashboard/analytics.vue",
    checks: [
      {
        label: "artist analytics page fetches overview and audience APIs separately",
        test: (source) =>
          /\$fetch\("\/api\/dashboard\/analytics"/.test(source)
          && /as ArtistAnalyticsOverviewResponse/.test(source)
          && /\$fetch\("\/api\/dashboard\/analytics\/audience"/.test(source)
          && /as ArtistAnalyticsAudienceResponse/.test(source)
          && /overviewRequestId/.test(source)
          && /audienceRequestId/.test(source),
      },
      {
        label: "artist analytics page renders from chart-ready server arrays",
        test: (source) =>
          /overviewData\.value\?\.monthlyRevenue/.test(source)
          && /overviewData\.value\?\.platformSeries/.test(source)
          && /overviewData\.value\?\.releaseRows/.test(source)
          && /audienceData\.value\?\.cards/.test(source)
          && !/filteredEarningsRows\.value\.reduce/.test(source)
          && !/filterRowsByAnalyticsRange/.test(source),
      },
      {
        label: "artist analytics page keeps charts visible and shows refetch pulses",
        test: (source) =>
          /isRefreshingOverview/.test(source)
          && /isRefreshingAudience/.test(source)
          && /analytics-loading-sweep/.test(source)
          && /updating\.\.\./.test(source),
      },
    ],
  },
  {
    file: "package.json",
    checks: [
      {
        label: "analytics charts do not ship ECharts dependencies",
        test: (source) =>
          /"@unovis\/vue"/.test(source)
          && !/"echarts"/.test(source)
          && !/"vue-echarts"/.test(source)
          && !/"nuxt-echarts"/.test(source)
          && !/"echarts-world-map-dk"/.test(source),
      },
    ],
  },
  {
    file: "nuxt.config.ts",
    checks: [
      {
        label: "Nuxt does not register the ECharts module",
        test: (source) => !/nuxt-echarts/.test(source),
      },
    ],
  },
  {
    file: "app/components/analytics/AnalyticsMonthlyRevenueChartPanel.vue",
    checks: [
      {
        label: "monthly revenue analytics chart renders with Unovis",
        test: (source) => /VisXYContainer/.test(source) && /VisLine/.test(source) && !/AnalyticsEChart|EChartsOption|echarts/.test(source),
      },
    ],
  },
  {
    file: "app/components/analytics/AnalyticsRankPanel.vue",
    checks: [
      {
        label: "rank analytics chart renders with Unovis bars",
        test: (source) => /VisXYContainer/.test(source) && /VisGroupedBar/.test(source) && !/AnalyticsEChart|EChartsOption|echarts/.test(source),
      },
    ],
  },
  {
    file: "app/components/analytics/AnalyticsPlatformMix.vue",
    checks: [
      {
        label: "platform analytics chart renders with Unovis lines",
        test: (source) => /VisXYContainer/.test(source) && /VisLine/.test(source) && !/AnalyticsEChart|EChartsOption|echarts/.test(source),
      },
    ],
  },
  {
    file: "app/components/analytics/AnalyticsAudiencePulse.vue",
    checks: [
      {
        label: "audience analytics chart renders with Unovis lines",
        test: (source) => /VisXYContainer/.test(source) && /VisLine/.test(source) && !/AnalyticsEChart|EChartsOption|echarts/.test(source),
      },
    ],
  },
  {
    file: "app/components/analytics/AnalyticsWorldMap.vue",
    checks: [
      {
        label: "country analytics map uses the local lightweight SVG renderer",
        test: (source) => /eckert3-world\.geojson\?raw/.test(source) && /world-map-svg/.test(source) && !/AnalyticsEChart|EChartsOption|echarts/.test(source),
      },
    ],
  },
  {
    file: statementRollupMigration,
    checks: [
      {
        label: "statement rollup migration adds DB-side earnings total RPC",
        test: (source) => /create or replace function public\.get_statement_earnings_totals/.test(source),
      },
      {
        label: "statement rollup migration adds DB-side monthly statement RPC",
        test: (source) => /create or replace function public\.get_artist_statement_earnings_monthly/.test(source),
      },
      {
        label: "statement rollup RPCs are service-role only",
        test: (source) =>
          /revoke all on function public\.get_statement_earnings_totals[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_statement_earnings_totals[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: statementEarningsPayloadMigration,
    checks: [
      {
        label: "statement earnings payload migration builds one paged JSON response",
        test: (source) =>
          /create or replace function public\.get_statement_earnings_page_payload/.test(source)
          && /returns jsonb/.test(source)
          && /jsonb_build_object/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /filtered_rows as materialized/.test(source)
          && /page_rows as materialized/.test(source)
          && /left join public\.channels as channel/.test(source)
          && /left join public\.releases as release/.test(source)
          && /left join public\.tracks as track/.test(source),
      },
      {
        label: "statement earnings payload migration preserves server pagination and filters",
        test: (source) =>
          /target_period_month is null or summary\.month = target_period_month/.test(source)
          && /target_release_id is null or base\.release_id = target_release_id/.test(source)
          && /target_channel_id is null or base\.channel_id = target_channel_id/.test(source)
          && /target_territory/.test(source)
          && /limit \(select page_size from pagination\)/.test(source)
          && /offset \(select \(page - 1\) \* page_size from pagination\)/.test(source),
      },
      {
        label: "statement earnings payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_statement_earnings_page_payload\(uuid\[\], integer, integer, date, date, date, uuid, uuid, text\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_statement_earnings_page_payload\(uuid\[\], integer, integer, date, date, date, uuid, uuid, text\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistStatementsPayloadMigration,
    checks: [
      {
        label: "artist statements payload migration builds the page JSON server-side",
        test: (source) =>
          /create or replace function public\.get_artist_statements_payload/.test(source)
          && /returns jsonb/.test(source)
          && /jsonb_build_object/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /from public\.statement_periods as statement_period/.test(source)
          && /from public\.publishing_earnings as publishing/.test(source)
          && /left join public\.releases as release/.test(source),
      },
      {
        label: "artist statements payload migration indexes publishing statement lookups",
        test: (source) =>
          /create index if not exists idx_publishing_earnings_artist_period_amount_id/.test(source)
          && /on public\.publishing_earnings \(artist_id, period_month desc, amount desc, id\)/.test(source),
      },
      {
        label: "artist statements payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_statements_payload\(uuid\[\]\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_statements_payload\(uuid\[\]\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: walletLedgerMigration,
    checks: [
      {
        label: "artist wallet view reads ledger and payout state instead of raw earnings",
        test: (source) =>
          /create or replace view public\.artist_wallet[\s\S]*from public\.transaction_ledger[\s\S]*from public\.payout_requests/m.test(source)
          && /with \(security_invoker = true\)/.test(source)
          && !/from public\.earnings/.test(source)
          && !/join public\.csv_uploads/.test(source),
      },
      {
        label: "wallet ledger migration stamps balance_after from the canonical ledger balance",
        test: (source) =>
          /create or replace function public\.current_artist_wallet_ledger_balance/.test(source)
          && /create trigger transaction_ledger_set_balance_after[\s\S]*before insert on public\.transaction_ledger/m.test(source),
      },
      {
        label: "wallet mutating RPCs compute returned balances from the ledger helper",
        test: (source) =>
          /create or replace function public\.create_publishing_earning[\s\S]*current_artist_wallet_ledger_balance/m.test(source)
          && /create or replace function public\.update_publishing_earning[\s\S]*current_artist_wallet_ledger_balance/m.test(source)
          && /create or replace function public\.delete_publishing_earning[\s\S]*current_artist_wallet_ledger_balance/m.test(source)
          && /create or replace function public\.update_due_charge[\s\S]*current_artist_wallet_ledger_balance/m.test(source)
          && /create or replace function public\.cancel_due_charge[\s\S]*current_artist_wallet_ledger_balance/m.test(source)
          && /create or replace function public\.accept_due_charge[\s\S]*current_artist_wallet_ledger_balance/m.test(source),
      },
    ],
  },
  {
    file: adminDashboardRollupMigration,
    checks: [
      {
        label: "admin dashboard migration adds DB-side summary and readiness RPCs",
        test: (source) =>
          /create or replace function public\.get_admin_dashboard_summary/.test(source)
          && /create or replace function public\.get_admin_dashboard_readiness/.test(source)
          && /create or replace function public\.get_admin_dashboard_statement_period_totals/.test(source),
      },
      {
        label: "admin dashboard rollup RPCs are service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_dashboard_summary\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_dashboard_summary\(\)[\s\S]*to service_role/.test(source)
          && /revoke all on function public\.get_admin_dashboard_readiness\(integer\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_dashboard_readiness\(integer\)[\s\S]*to service_role/.test(source)
          && /revoke all on function public\.get_admin_dashboard_statement_period_totals\(uuid\[\], date\[\]\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_dashboard_statement_period_totals\(uuid\[\], date\[\]\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: catalogQueryIndexMigration,
    checks: [
      {
        label: "catalog release and track pages have FK-aligned sort indexes",
        test: (source) =>
          /create index if not exists idx_releases_artist_sort[\s\S]*on public\.releases\s*\(\s*artist_id,\s*release_date desc nulls last,\s*created_at desc,\s*id\s*\)/.test(source)
          && /create index if not exists idx_tracks_release_sort[\s\S]*on public\.tracks\s*\(\s*release_id,\s*track_number asc nulls last,\s*created_at asc,\s*id\s*\)/.test(source),
      },
      {
        label: "artist collaborator release lookup has an artist-first index",
        test: (source) =>
          /create index if not exists idx_release_collaborators_artist_release[\s\S]*on public\.release_collaborators\s*\(\s*artist_id,\s*release_id\s*\)/.test(source),
      },
    ],
  },
  {
    file: artistAnalyticsAudienceMigration,
    checks: [
      {
        label: "artist analytics audience migration adds DB-side stream grouping RPC",
        test: (source) =>
          /create or replace function public\.get_artist_analytics_audience_streams/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /group by filtered\.month, filtered\.channel_id, filtered\.territory/.test(source),
      },
      {
        label: "artist analytics audience RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_analytics_audience_streams\(uuid\[\], date, date, text, text, text, text, text\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_analytics_audience_streams\(uuid\[\], date, date, text, text, text, text, text\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistAnalyticsOverviewMigration,
    checks: [
      {
        label: "artist analytics overview migration adds one DB-side rollup RPC",
        test: (source) =>
          /create or replace function public\.get_artist_analytics_overview_rollups/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /from public\.publishing_earnings as publishing/.test(source)
          && /'summary'::text/.test(source)
          && /'monthly'::text/.test(source)
          && /'platform_month'::text/.test(source)
          && /'filter_track'::text/.test(source),
      },
      {
        label: "artist analytics overview RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_analytics_overview_rollups\(uuid\[\], date, date, text, text, text, text, text\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_analytics_overview_rollups\(uuid\[\], date, date, text, text, text, text, text\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistDashboardHomeAnalyticsMigration,
    checks: [
      {
        label: "artist dashboard home analytics migration adds one slim DB-side rollup RPC",
        test: (source) =>
          /create or replace function public\.get_artist_dashboard_home_analytics_rollups/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /'summary'::text/.test(source)
          && /'monthly'::text/.test(source)
          && /'country'::text/.test(source)
          && /'platform'::text/.test(source)
          && /'release'::text/.test(source)
          && !/'platform_month'::text/.test(source)
          && !/'earnings_matrix'::text/.test(source)
          && !/'filter_track'::text/.test(source)
          && !/from public\.publishing_earnings/.test(source),
      },
      {
        label: "artist dashboard home analytics RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_dashboard_home_analytics_rollups\(uuid\[\], date, date\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_dashboard_home_analytics_rollups\(uuid\[\], date, date\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/dashboard.get.ts",
    checks: [
      {
        label: "admin dashboard loads the full dashboard payload through one service-role RPC",
        test: (source) =>
          /\.rpc\(\s*"get_admin_dashboard_payload"/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\(/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/earnings.get.ts",
    checks: [
      {
        label: "admin earnings ledger loads rows, summary, filters, and pagination through one payload RPC",
        test: (source) =>
          /\.rpc\(\s*"get_admin_earnings_payload"/.test(source)
          && /target_page:\s*requestedPage/.test(source)
          && /target_page_size:\s*requestedPageSize/.test(source)
          && /target_period_month:\s*filters\.periodMonth \|\| null/.test(source)
          && !/count:\s*"exact"/.test(source)
          && !/fetchAllPages/.test(source)
          && !/function loadRows/.test(source)
          && !/function loadSummary/.test(source)
          && !/function loadFilterOptions/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/analytics.get.ts",
    checks: [
      {
        label: "admin analytics API pages revenue rows through one service-role RPC",
        test: (source) =>
          /requireAdminProfile\(event\)/.test(source)
          && /\.rpc\(\s*"get_admin_analytics_revenue_rows"/.test(source)
          && /target_period_start_month:\s*monthDateFromKey\(monthRange\?\.startMonth\)/.test(source)
          && /target_period_end_month:\s*monthDateFromKey\(monthRange\?\.endMonth\)/.test(source)
          && /fetchAllPages<AdminAnalyticsRevenueRpcRow>/.test(source)
          && /\.range\(from,\s*to\)/.test(source)
          && !/\.from\("monthly_earnings_summary"\)/.test(source)
          && !/\.from\("artists"\)/.test(source)
          && !/\.from\("channels"\)/.test(source),
      },
      {
        label: "admin analytics API preserves revenueRows compatibility for drilldowns",
        test: (source) =>
          /function mapRevenueRow/.test(source)
          && /revenueRows:\s*\[\.\.\.revenueRows\]/.test(source)
          && /geoCountries:/.test(source)
          && /platformBreakdown:/.test(source)
          && /artistLeaderboard:/.test(source),
      },
      {
        label: "admin analytics API rejects money rows without artist details",
        test: (source) =>
          /function requireAnalyticsMoneyArtist/.test(source)
          && /returned a money row without artist details/.test(source)
          && /Admin revenue analytics/.test(source)
          && /Admin financial analytics/.test(source)
          && !/cleanText\(row\.artist_name\)\s*\|\|\s*"Unknown artist"/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/settings.get.ts",
    checks: [
      {
        label: "admin settings uses one DB-side payload RPC",
        test: (source) =>
          /\.rpc\(\s*"get_admin_settings_payload"/.test(source)
          && !/fetchAllPages/.test(source)
          && !/fetchAllByChunks/.test(source)
          && !/\.from\(/.test(source),
      },
    ],
  },
  {
    file: adminAnalyticsRevenueRowsMigration,
    checks: [
      {
        label: "admin analytics migration adds one JSON revenue rows RPC",
        test: (source) =>
          /create or replace function public\.get_admin_analytics_revenue_rows/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /left join public\.artists as active_artist/.test(source)
          && /left join public\.channels as channel/.test(source)
          && /jsonb_agg/.test(source),
      },
      {
        label: "admin analytics migration adds period and upload-first analytics indexes",
        test: (source) =>
          /idx_csv_uploads_status_period_id/.test(source)
          && /on public\.csv_uploads \(status, period_month, id\)/.test(source)
          && /idx_earnings_upload_original_analytics/.test(source)
          && /where earning_type = 'original'/.test(source),
      },
      {
        label: "admin analytics revenue rows RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_analytics_revenue_rows\(date, date\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_analytics_revenue_rows\(date, date\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: permanentDeleteAdminAnalyticsMigration,
    checks: [
      {
        label: "permanent delete explicitly purges monthly earnings cache rows",
        test: (source) =>
          /create or replace function public\.admin_purge_artist/.test(source)
          && /delete from public\.monthly_earnings_summary_cache as summary/.test(source)
          && /summary\.artist_id = target_artist_uuid/.test(source)
          && /summary\.upload_id = any\(csv_upload_ids\)/.test(source)
          && /summary\.release_id = any\(owned_release_ids\)/.test(source)
          && /summary\.track_id = any\(owned_track_ids\)/.test(source),
      },
      {
        label: "admin revenue analytics counts only live artist and upload-backed cache rows",
        test: (source) =>
          /create or replace function public\.get_admin_analytics_revenue_rows/.test(source)
          && /from public\.monthly_earnings_summary_cache as summary/.test(source)
          && /inner join public\.artists as artist/.test(source)
          && /artist\.is_active is not false/.test(source)
          && /inner join public\.csv_uploads as upload/.test(source)
          && /upload\.status = 'completed'/.test(source)
          && !/left join public\.artists/.test(source)
          && !/coalesce\(nullif\(btrim\(artist\.name\), ''\), 'Unknown artist'\) as artist_name/.test(source),
      },
      {
        label: "permanent delete and hardened revenue RPCs stay service-role only",
        test: (source) =>
          /revoke all on function public\.admin_purge_artist\(uuid\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.admin_purge_artist\(uuid\)[\s\S]*to service_role/.test(source)
          && /revoke all on function public\.get_admin_analytics_revenue_rows\(date, date\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_analytics_revenue_rows\(date, date\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: archiveArtistLifecycleMigration,
    checks: [
      {
        label: "artist archive migration creates archive RPC and removes orphan RPC",
        test: (source) =>
          /create or replace function public\.admin_archive_artist/.test(source)
          && /drop function if exists public\.admin_orphan_artist\(uuid, uuid\)/.test(source)
          && !/create or replace function public\.admin_orphan_artist/.test(source),
      },
      {
        label: "artist archive RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.admin_archive_artist\(uuid, uuid\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.admin_archive_artist\(uuid, uuid\)[\s\S]*to service_role/.test(source),
      },
      {
        label: "admin settings payload exposes archived artist fields",
        test: (source) =>
          /create or replace function public\.get_admin_settings_payload/.test(source)
          && /'archivedArtistCount'/.test(source)
          && /'archivedArtists'/.test(source)
          && !/'orphanedArtistCount'/.test(source)
          && !/'orphanedArtists'/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/artists/[id]/archive.post.ts",
    checks: [
      {
        label: "artist archive endpoint uses archive naming and RPC",
        test: (source) =>
          /\.rpc\(\s*"admin_archive_artist"/.test(source)
          && /action:\s*"archive"/.test(source)
          && /artist\.archived/.test(source)
          && !/admin_orphan_artist/.test(source)
          && !/action:\s*"orphan"/.test(source),
      },
      {
        label: "legacy orphan artist endpoint is removed",
        test: () => !fileExists("app/server/api/admin/artists/[id]/orphan.post.ts"),
      },
    ],
  },
  {
    file: archivedArtistManagementMigration,
    checks: [
      {
        label: "archived artist settings payload includes editable profile fields",
        test: (source) =>
          /create or replace function public\.get_admin_settings_payload/.test(source)
          && /'archivedArtists'/.test(source)
          && /'artistSharePct'/.test(source)
          && /'avatarMode'/.test(source)
          && /'avatarPreset'/.test(source)
          && /'avatarCustomColors'/.test(source)
          && /'avatarUrl'/.test(source)
          && /'publishingInfo'/.test(source)
          && /'bankDetails'/.test(source)
          && /'dspProfiles'/.test(source)
          && /'socialLinks'/.test(source),
      },
      {
        label: "archived artist settings payload RPC stays service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_settings_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_settings_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/artists/bulk-permanent-delete.post.ts",
    checks: [
      {
        label: "bulk permanent delete accepts archived inactive artists",
        test: (source) =>
          /\.select\("id, name"\)/.test(source)
          && !/is_active/.test(source)
          && !/Only active artists can be selected/.test(source),
      },
      {
        label: "bulk permanent delete reuses storage-cleaning permanent delete path",
        test: (source) =>
          /permanentlyDeleteArtistForAdmin\(supabase, profile\.id, artistId/.test(source)
          && /aggregateArtistStorageCleanup/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/artists/[id].patch.ts",
    checks: [
      {
        label: "admin artist update allows saved email edits for archived artists without live login",
        test: (source) =>
          /if \(!existingArtist\.user_id && existingArtist\.is_active\)/.test(source)
          && /if \(existingArtist\.user_id\)[\s\S]*supabase\.auth\.admin\.updateUserById/.test(source),
      },
      {
        label: "admin artist update saves archived bank, DSP, and social settings",
        test: (source) =>
          /body\?\.bankDetails/.test(source)
          && /\.from\("artist_bank_details"\)/.test(source)
          && /body\?\.dspProfiles/.test(source)
          && /\.from\("artist_dsp_profile_preferences"\)/.test(source)
          && /body\?\.socialLinks/.test(source)
          && /\.from\("artist_social_links"\)/.test(source)
          && /updatedSections\.push\("bankDetails"\)/.test(source)
          && /updatedSections\.push\("dspProfiles"\)/.test(source)
          && /updatedSections\.push\("socialLinks"\)/.test(source),
      },
      {
        label: "admin bank edits avoid artist-facing bank change notifications",
        test: (source) =>
          !/bank_changed/.test(source)
          && !/bank.*notification/i.test(source),
      },
    ],
  },
  {
    file: "server/utils/admin-artist-purge.ts",
    checks: [
      {
        label: "permanent delete cleans storage before database purge",
        test: (source) =>
          /const storageCleanup = await cleanupArtistStorage\(supabase, artistId, artist\.name\)/.test(source)
          && source.indexOf("const storageCleanup = await cleanupArtistStorage(supabase, artistId, artist.name)") < source.indexOf('supabase.rpc("admin_purge_artist"'),
      },
      {
        label: "permanent delete cleans S3 media prefixes when S3 storage is enabled",
        test: (source) =>
          /if \(isS3MediaStorageEnabled\(\)\)/.test(source)
          && /deleteMediaPrefix\(`releases\/\$\{artistId\}\/`\)/.test(source)
          && /deleteMediaFoldersEndingWith\("releases\/audio\/", `--\$\{artistId\}`\)/.test(source)
          && /deleteMediaPrefix\(`artists\/\$\{artistId\}\/avatars\/`\)/.test(source),
      },
    ],
  },
  {
    file: adminSettingsPayloadMigration,
    checks: [
      {
        label: "admin settings migration adds one JSON payload RPC",
        test: (source) =>
          /create or replace function public\.get_admin_settings_payload/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.monthly_earnings_summary as summary/.test(source)
          && /from public\.admin_activity_log/.test(source)
          && /from public\.channels as channel/.test(source),
      },
      {
        label: "admin settings payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_settings_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_settings_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminDashboardPayloadMigration,
    checks: [
      {
        label: "admin dashboard payload migration builds the whole dashboard JSON server-side",
        test: (source) =>
          /create or replace function public\.get_admin_dashboard_payload/.test(source)
          && /returns jsonb/.test(source)
          && /'recentUploads'/.test(source)
          && /'pendingReleases'/.test(source)
          && /'payoutQueue'/.test(source)
          && /'recentStatementPeriods'/.test(source)
          && /'artistReadiness'/.test(source)
          && /'recentActivity'/.test(source),
      },
      {
        label: "admin dashboard payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_dashboard_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_dashboard_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminEarningsSummaryMigration,
    checks: [
      {
        label: "admin earnings summary migration adds filtered aggregate RPC",
        test: (source) =>
          /create or replace function public\.get_admin_earnings_ledger_summary/.test(source)
          && /from public\.earnings as e/.test(source)
          && /count\(\*\)::bigint as row_count/.test(source)
          && /sum\(e\.total_amount\)/.test(source)
          && /count\(distinct e\.artist_id\)/.test(source)
          && /target_upload_ids is null or e\.upload_id = any\(target_upload_ids\)/.test(source),
      },
      {
        label: "admin earnings summary RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_earnings_ledger_summary\(uuid, uuid, uuid, uuid, text, text, uuid\[\]\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_earnings_ledger_summary\(uuid, uuid, uuid, uuid, text, text, uuid\[\]\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminEarningsFilterValuesMigration,
    checks: [
      {
        label: "admin earnings filter values migration returns distinct periods and territories",
        test: (source) =>
          /create or replace function public\.get_admin_earnings_filter_values/.test(source)
          && /select distinct upload\.period_month/.test(source)
          && /from public\.csv_uploads as upload/.test(source)
          && /select distinct btrim\(earning\.territory\) as territory/.test(source)
          && /from public\.earnings as earning/.test(source),
      },
      {
        label: "admin earnings filter values RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_earnings_filter_values\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_earnings_filter_values\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/artists.get.ts",
    checks: [
      {
        label: "admin artists API supports a slim dropdown options surface",
        test: (source) =>
          /surfaceFromQuery\(query\.surface\)/.test(source)
          && /surface === "options"/.test(source)
          && /\.select\("id, name, email"\)/.test(source)
          && /\.rpc\(\s*"get_admin_artists_payload"/.test(source),
      },
    ],
  },
  {
    file: adminArtistsPayloadMigration,
    checks: [
      {
        label: "admin artists payload migration builds full artist management rows in one RPC",
        test: (source) =>
          /create or replace function public\.get_admin_artists_payload/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.artists as artist/.test(source)
          && /left join public\.profiles as linked_profile/.test(source)
          && /left join public\.artist_bank_details as bank/.test(source)
          && /left join public\.artist_publishing_info as publishing/.test(source)
          && /'sharedAccountArtistCount'/.test(source)
          && /'bankDetails'/.test(source)
          && /'publishingInfo'/.test(source),
      },
      {
        label: "admin artists payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_artists_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_artists_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: "app/pages/admin/ingestion.vue",
    checks: [
      {
        label: "admin ingestion uses slim artist options instead of full artist management payload",
        test: (source) =>
          /useLazyFetch<\{\s*artists:\s*ImportArtistOption\[\]\s*\}>\(\s*"\/api\/admin\/artists"/.test(source)
          && /surface:\s*"options"/.test(source),
      },
    ],
  },
  {
    file: "app/pages/admin/releases.vue",
    checks: [
      {
        label: "admin releases uses slim artist options instead of full artist management payload",
        test: (source) =>
          /useLazyFetch<\{\s*artists:\s*ImportArtistOption\[\]\s*\}>\(\s*"\/api\/admin\/artists"/.test(source)
          && /surface:\s*"options"/.test(source),
      },
    ],
  },
  {
    file: "app/pages/dashboard/index.vue",
    checks: [
      {
        label: "artist dashboard home bundles wallet and home payloads in one request",
        test: (source) =>
          /useLazyFetch<ArtistDashboardHomeSummaryResponse>\(\s*"\/api\/dashboard\/home-summary"/.test(source)
          && /homeSummaryData\.value\?\.wallet/.test(source)
          && /homeSummaryData\.value\?\.home/.test(source)
          && /homeData\.value\?\.releaseLookup/.test(source)
          && /homeData\.value\?\.setup\.artist/.test(source),
      },
      {
        label: "artist dashboard home uses slim analytics surface",
        test: (source) =>
          /useLazyFetch<ArtistAnalyticsOverviewResponse>\(\s*"\/api\/dashboard\/analytics"/.test(source)
          && /surface:\s*"dashboard_home"/.test(source)
          && /overviewPeriodRange:\s*"last_12_months"/.test(source),
      },
      {
        label: "artist dashboard home no longer makes a separate wallet HTTP request",
        test: (source) =>
          !/useLazyFetch<ArtistWalletResponse>\(\s*"\/api\/dashboard\/wallet"/.test(source)
          && !/walletSummaryQuery/.test(source),
      },
      {
        label: "artist dashboard home does not fetch full releases or settings payloads",
        test: (source) =>
          !/useLazyFetch<ArtistReleasesResponse>\(\s*"\/api\/dashboard\/releases"/.test(source)
          && !/useLazyFetch<ArtistSettingsResponse>\(\s*"\/api\/dashboard\/settings"/.test(source)
          && !/releasesData/.test(source)
          && !/settingsData/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/home-summary.get.ts",
    checks: [
      {
        label: "artist dashboard home summary endpoint resolves dashboard scope once",
        test: (source) =>
          /resolveArtistDashboardScope\(event,\s*requestedArtistId,\s*"dashboard home summary"\)/.test(source)
          && /normalizeDashboardArtistQuery\(query\.artistId\)/.test(source),
      },
      {
        label: "artist dashboard home summary endpoint combines existing DB-side wallet and home RPCs",
        test: (source) =>
          /Promise\.all\(\[/.test(source)
          && /\.rpc\(\s*"get_artist_dashboard_wallet_payload"/.test(source)
          && /\.rpc\(\s*"get_artist_dashboard_home_payload"/.test(source)
          && /target_artist_ids:\s*artistIds/.test(source)
          && /target_artist_owner_user_id:\s*scope\.artistOwnerUserId/.test(source),
      },
      {
        label: "artist dashboard home summary endpoint avoids raw table scans",
        test: (source) =>
          !/\.from\(/.test(source)
          && !/fetchAllPages/.test(source)
          && !/fetchAllByChunks/.test(source),
      },
    ],
  },
  {
    file: "app/pages/dashboard/uploaded.vue",
    checks: [
      {
        label: "artist upload page submits releases without owning DSP profile preferences",
        test: (source) =>
          /\/api\/dashboard\/uploads\/releases/.test(source)
          && /\/api\/dashboard\/uploads\/create-asset/.test(source)
          && /artistId:\s*form\.artistId/.test(source)
          && /stores:\s*selectedStores\.value/.test(source)
          && /tracks:\s*uploadedTracks/.test(source)
          && /useLazyFetch<ArtistSettingsResponse>\(\s*"\/api\/dashboard\/settings"/.test(source)
          && /surface:\s*"upload_preferences"/.test(source)
          && !/uploadSettingsQuery/.test(source)
          && !/ArtistDspProfileEditor/.test(source)
          && !/dspProfiles:\s*\{/.test(source)
          && !/(spotify-|meta-|waveform|gsap|PremiumAudioPlayer|previewPlayback|bottom-audio-player)/i.test(source)
          && !/(--wizard-purple|#7447ff|wizard-|uploader-help-panel|uploader-step-rail|transition:\s*all)/i.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/releases/[id]/pending-submission.delete.ts",
    checks: [
      {
        label: "artist pending-review release delete withdraws only owner draft submissions",
        test: (source) =>
          /requireArtistProfile\(event\)/.test(source)
          && /artist_release_submissions/.test(source)
          && /\.eq\("status",\s*"pending_review"\)/.test(source)
          && /status:\s*"deleted"/.test(source)
          && /eventType:\s*"release_deleted"/.test(source)
          && /artist_pending_review_delete/.test(source),
      },
    ],
  },
  {
    file: "app/pages/dashboard/settings.vue",
    checks: [
      {
        label: "artist settings remains the DSP profile preference home",
        test: (source) =>
          /useLazyFetch<ArtistSettingsResponse>\(\s*"\/api\/dashboard\/settings"/.test(source)
          && /ArtistDspProfileEditor/.test(source)
          && /isSavingDspProfiles/.test(source)
          && /dspProfiles:\s*\{[\s\S]*profiles:\s*(?:dspProfileDrafts\.value|profilesToSave)/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/settings.get.ts",
    checks: [
      {
        label: "artist settings API supports slim upload preferences surface",
        test: (source) =>
          /surfaceFromQuery\(query\.surface\)\s*===?\s*"upload_preferences"|const surface = surfaceFromQuery\(query\.surface\)/.test(source)
          && /surface === "upload_preferences"/.test(source)
          && /artist_dsp_profile_preferences\(platform, profile_exists, profile_url, display_name, avatar_url, updated_at\)/.test(source)
          && /bankDetails:\s*null/.test(source)
          && /publishingInfo:\s*null/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/home.get.ts",
    checks: [
      {
        label: "artist dashboard home endpoint preserves authorized artist scoping",
        test: (source) =>
          /resolveArtistDashboardScope\(event,\s*requestedArtistId,\s*"dashboard home"\)/.test(source)
          && /serverSupabaseServiceRole\(event\)/.test(source)
          && /normalizeDashboardArtistQuery\(query\.artistId\)/.test(source),
      },
      {
        label: "artist dashboard home endpoint loads release and setup data through one DB-side RPC",
        test: (source) =>
          /\.rpc\(\s*"get_artist_dashboard_home_payload"/.test(source)
          && /target_artist_ids:\s*artistIds/.test(source)
          && /target_artist_owner_user_id:\s*scope\.artistOwnerUserId/.test(source)
          && /target_profile_full_name:\s*scope\.profile\.full_name\s*\?\?\s*""/.test(source)
          && /target_is_impersonating:\s*scope\.isImpersonating/.test(source),
      },
      {
        label: "artist dashboard home endpoint avoids raw table scans and full release payload loaders",
        test: (source) =>
          !/\.from\(/.test(source)
          && !/fetchAllPages/.test(source)
          && !/fetchAllByChunks/.test(source)
          && !/loadReleaseSplitHistory/.test(source)
          && !/loadTrackSplitHistory/.test(source)
          && !/loadTrackCreditsByTrackIds/.test(source)
          && !/loadReleaseEventsByReleaseIds/.test(source)
          && !/loadReleaseChangeRequestsByReleaseIds/.test(source)
          && !/loadReleaseSubmissionsByReleaseIds/.test(source),
      },
    ],
  },
  {
    file: "app/pages/dashboard/releases.vue",
    checks: [
      {
        label: "artist releases page fetches a paged catalog list surface first",
        test: (source) =>
          /surface:\s*"catalog_list"/.test(source)
          && /page:\s*releasesPage\.value/.test(source)
          && /pageSize:\s*releasesPageSize/.test(source)
          && /totalReleasesCount/.test(source),
      },
      {
        label: "artist releases page lazy-loads full release details when opened",
        test: (source) =>
          /async function loadSelectedReleaseDetail/.test(source)
          && /releaseId,/.test(source)
          && /selectedReleasePending/.test(source)
          && /selectedRelease\.value = result\.releases\[0\]/.test(source),
      },
      {
        label: "artist releases cards render from list track counts, not full nested tracks",
        test: (source) =>
          /function releaseTrackCount/.test(source)
          && /release\.trackCount \?\? release\.tracks\.length/.test(source)
          && /releaseTrackCount\(release\)[\s\S]*track/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/releases.get.ts",
    checks: [
      {
        label: "artist releases API supports the slim catalog list RPC",
        test: (source) =>
          /releaseSurfaceFromQuery\(query\.surface\)/.test(source)
          && /surface === "catalog_list"/.test(source)
          && /\.rpc\(\s*"get_artist_releases_list_payload"/.test(source)
          && /target_page:\s*requestedPage/.test(source)
          && /target_page_size:\s*requestedPageSize/.test(source),
      },
      {
        label: "artist releases detail path scopes nested loaders to one requested release",
        test: (source) =>
          /requestedReleaseId/.test(source)
          && /releaseById\.has\(requestedReleaseId\)/.test(source)
          && /releaseById\.delete\(releaseId\)/.test(source)
          && /const visibleReleaseIds = \[\.\.\.releaseById\.keys\(\)\]/.test(source)
          && /loadTrackRows\(supabase, visibleReleaseIds\)/.test(source)
          && /loadReleaseEventsByReleaseIds\(supabase, visibleReleaseIds\)/.test(source),
      },
    ],
  },
  {
    file: artistReleasesListPayloadMigration,
    checks: [
      {
        label: "artist releases list payload migration builds a paged card payload",
        test: (source) =>
          /create or replace function public\.get_artist_releases_list_payload/.test(source)
          && /returns jsonb/.test(source)
          && /visible_releases as materialized/.test(source)
          && /page_releases as materialized/.test(source)
          && /'trackCount'/.test(source)
          && /'pagination'/.test(source),
      },
      {
        label: "artist releases list payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_releases_list_payload\(uuid\[\], integer, integer\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_releases_list_payload\(uuid\[\], integer, integer\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistDashboardHomePayloadMigration,
    checks: [
      {
        label: "artist dashboard home payload migration adds indexes for collaborator and submission lookups",
        test: (source) =>
          /idx_track_collaborators_artist_track/.test(source)
          && /idx_artist_release_submissions_release_created/.test(source)
          && /idx_artist_dsp_profile_preferences_artist/.test(source),
      },
      {
        label: "artist dashboard home payload migration builds release lookup and setup JSON server-side",
        test: (source) =>
          /create or replace function public\.get_artist_dashboard_home_payload/.test(source)
          && /returns jsonb/.test(source)
          && /'latestRelease'/.test(source)
          && /'releaseLookup'/.test(source)
          && /'setup'/.test(source)
          && /from public\.releases as release/.test(source)
          && /from public\.tracks as track/.test(source)
          && /from public\.artist_release_submissions as submission/.test(source)
          && /from public\.artist_dsp_profile_preferences as profile/.test(source),
      },
      {
        label: "artist dashboard home payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_dashboard_home_payload\(uuid\[\], uuid, text, boolean\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_dashboard_home_payload\(uuid\[\], uuid, text, boolean\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminEarningsPayloadMigration,
    checks: [
      {
        label: "admin earnings payload migration builds one JSON response for the ledger page",
        test: (source) =>
          /create or replace function public\.get_admin_earnings_payload/.test(source)
          && /returns jsonb/.test(source)
          && /'rows'/.test(source)
          && /'summary'/.test(source)
          && /'filterOptions'/.test(source)
          && /'pagination'/.test(source)
          && /from public\.earnings as earning/.test(source)
          && /target_period_month is null or upload\.period_month = target_period_month/.test(source),
      },
      {
        label: "admin earnings payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_earnings_payload\(integer, integer, uuid, uuid, uuid, uuid, text, date, text\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_earnings_payload\(integer, integer, uuid, uuid, uuid, uuid, text, date, text\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminEarningsPayloadRefineMigration,
    checks: [
      {
        label: "admin earnings payload only joins display tables after page slicing",
        test: (source) =>
          /create or replace function public\.get_admin_earnings_payload/.test(source)
          && /filtered_earnings as materialized/.test(source)
          && /left join public\.csv_uploads as upload_filter/.test(source)
          && /target_period_month is null or upload_filter\.period_month = target_period_month/.test(source)
          && /page_earnings as materialized/.test(source)
          && /page_rows as \(/.test(source)
          && /from page_earnings as earning/.test(source),
      },
      {
        label: "refined admin earnings payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_earnings_payload\(integer, integer, uuid, uuid, uuid, uuid, text, date, text\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_earnings_payload\(integer, integer, uuid, uuid, uuid, uuid, text, date, text\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/wallet.get.ts",
    checks: [
      {
        label: "artist wallet API loads the wallet payload through one DB-side RPC",
        test: (source) =>
          /get_artist_wallet_payload/.test(source)
          && /target_artist_ids:\s*artistIds/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\(/.test(source),
      },
      {
        label: "artist wallet API supports a slim dashboard-home surface",
        test: (source) =>
          /surfaceFromQuery\(query\.surface\)\s*===\s*"dashboard_home"/.test(source)
          && /get_artist_dashboard_wallet_payload/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/payouts.get.ts",
    checks: [
      {
        label: "artist payouts API loads payout options and requests through one DB-side RPC",
        test: (source) =>
          /\.rpc\(\s*"get_artist_payouts_payload"/.test(source)
          && /target_artist_ids:\s*artistIds/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\(/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/payouts.get.ts",
    checks: [
      {
        label: "admin payouts API loads recent requests and summary through one DB-side RPC",
        test: (source) =>
          /\.rpc\(\s*"get_admin_payouts_payload"/.test(source)
          && /target_limit:\s*100/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\(/.test(source)
          && !/mapPayoutRequestRecord/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/publishing.get.ts",
    checks: [
      {
        label: "admin publishing API loads entries, summary, and options through one DB-side RPC",
        test: (source) =>
          /\.rpc\(\s*"get_admin_publishing_payload"/.test(source)
          && !/fetchAllPages/.test(source)
          && !/fetchAllByChunks/.test(source)
          && !/\.from\(/.test(source)
          && !/mapAdminPublishingRecord/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/dues.get.ts",
    checks: [
      {
        label: "admin dues API loads rows, summary, and artist options through one DB-side RPC",
        test: (source) =>
          /\.rpc\(\s*"get_admin_dues_payload"/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\(/.test(source)
          && !/mapAdminDueRecord/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/notifications.get.ts",
    checks: [
      {
        label: "artist notifications API loads rows and counts through one DB-side RPC",
        test: (source) =>
          /serverSupabaseServiceRole\(event\)/.test(source)
          && /\.rpc\(\s*"get_artist_notifications_payload"/.test(source)
          && /target_artist_ids:\s*artistIds/.test(source)
          && /target_page:\s*requestedPage/.test(source)
          && /target_page_size:\s*requestedPageSize/.test(source)
          && /target_unread_only:\s*unreadOnly/.test(source),
      },
      {
        label: "artist notifications API does not reintroduce separate notification scans",
        test: (source) =>
          !/\.from\(\s*"notifications"/.test(source)
          && !/count:\s*"exact"/.test(source)
          && !/mapArtistNotificationRecord/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/dashboard/dues/[id]/accept.post.ts",
    checks: [
      {
        label: "artist due acceptance goes through the wallet-posting RPC",
        test: (source) => /requireArtistProfile\(event\)/.test(source) && /\.rpc\("accept_due_charge"/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/imports/[id]/delete.post.ts",
    checks: [
      {
        label: "CSV delete confirmation sums upload earnings through one aggregate RPC",
        test: (source) =>
          /\.rpc\(\s*"get_csv_upload_original_earnings_total"/.test(source)
          && /target_upload_id:\s*upload\.id/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\("earnings"\)/.test(source)
          && !/earningsRows/.test(source),
      },
      {
        label: "CSV delete confirmation keeps negative-balance confirmation behavior",
        test: (source) =>
          /resultingBalance\.isNegative\(\)/.test(source)
          && /requiresConfirmation:\s*true/.test(source)
          && /\.rpc\(\s*"delete_csv_upload"/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/imports/[id]/replace.post.ts",
    checks: [
      {
        label: "CSV replacement endpoint commits through one server RPC",
        test: (source) => /\.rpc\("replace_csv_upload"/.test(source),
      },
      {
        label: "CSV replacement endpoint returns old storage cleanup status",
        test: (source) => /oldStorageDeleted[\s\S]*oldStorageWarning/m.test(source),
      },
    ],
  },
  {
    file: csvDeleteUploadTotalMigration,
    checks: [
      {
        label: "CSV delete upload total migration adds original earnings aggregate RPC",
        test: (source) =>
          /create or replace function public\.get_csv_upload_original_earnings_total/.test(source)
          && /returns numeric/.test(source)
          && /from public\.earnings as earning/.test(source)
          && /earning\.upload_id = target_upload_id/.test(source)
          && /earning\.earning_type = 'original'/.test(source),
      },
      {
        label: "CSV delete upload total RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_csv_upload_original_earnings_total\(uuid\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_csv_upload_original_earnings_total\(uuid\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistWalletPayloadMigration,
    checks: [
      {
        label: "artist wallet payload migration preserves wallet, ledger, and due data in one payload",
        test: (source) =>
          /create or replace function public\.get_artist_wallet_payload/.test(source)
          && /returns jsonb/.test(source)
          && /public\.artist_wallet as wallet/.test(source)
          && /from public\.transaction_ledger as ledger/.test(source)
          && /ledger\.type <> 'csv_reversal'/.test(source)
          && /from public\.dues as due/.test(source),
      },
      {
        label: "artist wallet payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_wallet_payload\(uuid\[\]\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_wallet_payload\(uuid\[\]\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistDashboardWalletPayloadMigration,
    checks: [
      {
        label: "artist dashboard wallet payload migration builds only dashboard-needed wallet JSON",
        test: (source) =>
          /create or replace function public\.get_artist_dashboard_wallet_payload/.test(source)
          && /returns jsonb/.test(source)
          && /limit 3/.test(source)
          && /where due\.status = 'pending_acceptance'/.test(source)
          && /from public\.artist_wallet as wallet/.test(source)
          && /from public\.transaction_ledger as ledger/.test(source)
          && /from public\.dues as due/.test(source),
      },
      {
        label: "artist dashboard wallet payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_dashboard_wallet_payload\(uuid\[\]\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_dashboard_wallet_payload\(uuid\[\]\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistPayoutsPayloadMigration,
    checks: [
      {
        label: "artist payouts payload migration preserves wallet payout options and request records",
        test: (source) =>
          /create or replace function public\.get_artist_payouts_payload/.test(source)
          && /returns jsonb/.test(source)
          && /public\.artist_wallet as wallet/.test(source)
          && /from public\.payout_requests as request/.test(source)
          && /'minimumAmount', '50\.00000000'/.test(source),
      },
      {
        label: "artist payouts payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_payouts_payload\(uuid\[\]\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_payouts_payload\(uuid\[\]\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminPayoutsPayloadMigration,
    checks: [
      {
        label: "admin payouts payload migration preserves recent request rows and summary totals",
        test: (source) =>
          /create or replace function public\.get_admin_payouts_payload/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.payout_requests as request/.test(source)
          && /left join public\.artist_bank_details as bank_details/.test(source)
          && /count\(\*\) filter \(where status = 'pending'\)/.test(source)
          && /sum\(amount\) filter \(where status = 'approved'\)/.test(source)
          && /'bankDetails'/.test(source),
      },
      {
        label: "admin payouts payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_payouts_payload\(integer\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_payouts_payload\(integer\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminPublishingPayloadMigration,
    checks: [
      {
        label: "admin publishing payload migration preserves entries, summary, and select options",
        test: (source) =>
          /create or replace function public\.get_admin_publishing_payload/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.publishing_earnings as publishing/.test(source)
          && /left join public\.profiles as profile/.test(source)
          && /'entries'/.test(source)
          && /'summary'/.test(source)
          && /'artistOptions'/.test(source)
          && /'releaseOptions'/.test(source)
          && /count\(distinct release_id\) filter \(where release_id is not null\)/.test(source),
      },
      {
        label: "admin publishing payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_publishing_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_publishing_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: adminDuesPayloadMigration,
    checks: [
      {
        label: "admin dues payload migration preserves due rows, summaries, and artist options",
        test: (source) =>
          /create or replace function public\.get_admin_dues_payload/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.dues as due/.test(source)
          && /left join public\.profiles as accepted_profile/.test(source)
          && /left join public\.profiles as cancelled_profile/.test(source)
          && /'dues'/.test(source)
          && /'summary'/.test(source)
          && /'artistOptions'/.test(source)
          && /sum\(amount\) filter \(where status in \('unpaid', 'paid'\)\)/.test(source),
      },
      {
        label: "admin dues payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_dues_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_dues_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: artistNotificationsPayloadMigration,
    checks: [
      {
        label: "artist notifications payload migration adds the artist/date covering index",
        test: (source) =>
          /create index if not exists idx_notifications_artist_created/.test(source)
          && /on public\.notifications \(artist_id, created_at desc, id desc\)/.test(source),
      },
      {
        label: "artist notifications payload migration builds rows, unread count, and pagination server-side",
        test: (source) =>
          /create or replace function public\.get_artist_notifications_payload/.test(source)
          && /returns jsonb/.test(source)
          && /'notifications'/.test(source)
          && /'unreadCount'/.test(source)
          && /'totalCount'/.test(source)
          && /'pagination'/.test(source)
          && /from public\.notifications as notification/.test(source)
          && /left join public\.artists as artist/.test(source),
      },
      {
        label: "artist notifications payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_artist_notifications_payload\(uuid\[\], integer, integer, boolean\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_artist_notifications_payload\(uuid\[\], integer, integer, boolean\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: "app/server/api/admin/reconciliation.get.ts",
    checks: [
      {
        label: "reconciliation is an admin-only DB-side payload scan",
        test: (source) =>
          /requireAdminProfile\(event\)/.test(source)
          && /\.rpc\(\s*"get_admin_reconciliation_payload"/.test(source)
          && !/fetchAllPages/.test(source)
          && !/\.from\(/.test(source),
      },
      {
        label: "reconciliation endpoint preserves response shape fallback",
        test: (source) =>
          /checkedAt:\s*new Date\(\)\.toISOString\(\)/.test(source)
          && /artistCount:\s*0/.test(source)
          && /artists:\s*\[\]/.test(source),
      },
    ],
  },
  {
    file: adminReconciliationPayloadMigration,
    checks: [
      {
        label: "admin reconciliation payload migration compares wallet, statements, uploads, dues, payouts, and ledger",
        test: (source) =>
          /create or replace function public\.get_admin_reconciliation_payload/.test(source)
          && /returns jsonb/.test(source)
          && /from public\.artist_wallet/.test(source)
          && /from public\.statement_periods/.test(source)
          && /from public\.csv_uploads/.test(source)
          && /from public\.earnings/.test(source)
          && !/analytics_snapshots/.test(source)
          && /from public\.dues/.test(source)
          && /from public\.payout_requests/.test(source)
          && /from public\.transaction_ledger/.test(source),
      },
      {
        label: "admin reconciliation payload flags core money mismatch codes",
        test: (source) =>
          /wallet_statement_mismatch/.test(source)
          && /completed_upload_total_mismatch/.test(source)
          && /ledger_sum_mismatch/.test(source)
          && /stale_balance_after/.test(source),
      },
      {
        label: "admin reconciliation payload excludes dues awaiting artist acceptance from wallet deductions",
        test: (source) => /due\.status in \('unpaid', 'paid'\)/.test(source),
      },
      {
        label: "admin reconciliation payload RPC is service-role only",
        test: (source) =>
          /revoke all on function public\.get_admin_reconciliation_payload\(\)[\s\S]*from public, anon, authenticated/.test(source)
          && /grant execute on function public\.get_admin_reconciliation_payload\(\)[\s\S]*to service_role/.test(source),
      },
    ],
  },
  {
    file: migration,
    checks: [
      {
        label: "wallet and monthly summary views only count active original CSV earnings",
        test: (source) =>
          /create or replace view public\.artist_wallet[\s\S]*u\.status = 'completed'[\s\S]*e\.earning_type = 'original'[\s\S]*create or replace view public\.monthly_earnings_summary[\s\S]*u\.status = 'completed'[\s\S]*e\.earning_type = 'original'/m.test(source),
      },
      {
        label: "legacy CSV delete migration removed linked financial data and recalculated ledger balances",
        test: (source) =>
          /create or replace function public\.delete_csv_upload/.test(source)
          && /delete from public\.earnings/.test(source)
          && /delete from public\.analytics_snapshots/.test(source)
          && /perform public\.recalculate_artist_ledger_balances/.test(source),
      },
      {
        label: "CSV replacement is atomic and logs csv.replaced",
        test: (source) =>
          /create or replace function public\.replace_csv_upload/.test(source)
          && /old_upload\.status <> 'completed'/.test(source)
          && /new_upload\.status <> 'processing'/.test(source)
          && /'csv\.replaced'/.test(source),
      },
    ],
  },
  {
    file: csvDerivedAnalyticsMigration,
    checks: [
      {
        label: "CSV commit and replacement no longer insert manual analytics snapshots",
        test: (source) =>
          /create or replace function public\.commit_csv_upload/.test(source)
          && /create or replace function public\.replace_csv_upload/.test(source)
          && !/insert into public\.analytics_snapshots/.test(source)
          && !/analyticsRows/.test(source),
      },
      {
        label: "CSV delete and replacement preserve historical analytics snapshots",
        test: (source) =>
          /create or replace function public\.delete_csv_upload/.test(source)
          && /create or replace function public\.replace_csv_upload/.test(source)
          && /delete from public\.earnings/.test(source)
          && /delete from public\.csv_uploads/.test(source)
          && !/delete from public\.analytics_snapshots/.test(source),
      },
    ],
  },
  {
    file: paginationIndexMigration,
    checks: [
      {
        label: "statement earnings pagination index covers artist, status, period, and upload id",
        test: (source) =>
          /idx_csv_uploads_artist_status_period_id/.test(source)
          && /\(artist_id,\s*status,\s*period_month,\s*id\)/.test(source),
      },
    ],
  },
  {
    file: dueAcceptanceMigration,
    checks: [
      {
        label: "pending due requests are excluded from artist wallet totals",
        test: (source) => /create or replace view public\.artist_wallet[\s\S]*where status in \('unpaid', 'paid'\)/m.test(source),
      },
      {
        label: "new admin-created dues wait for artist acceptance",
        test: (source) =>
          /create or replace function public\.create_due_charge[\s\S]*'pending_acceptance'[\s\S]*'Due awaiting acceptance'/m.test(source),
      },
      {
        label: "artist due acceptance posts the wallet ledger deduction",
        test: (source) =>
          /create or replace function public\.accept_due_charge/.test(source)
          && /due_row\.amount \* -1/.test(source)
          && /format\('due:accept:%s', due_row\.id\)/.test(source),
      },
    ],
  },
]

const failures = []

if (fileExists("app/server/api/admin/imports/[id]/reverse.post.ts")) {
  failures.push("app/server/api/admin/imports/[id]/reverse.post.ts: active reversal endpoint must stay removed")
}

const liveAppSourceFiles = [...listFiles("app"), ...listFiles("server")]
  .filter((file) => /\.(?:ts|tsx|js|jsx|mjs|vue)$/.test(file))

for (const file of liveAppSourceFiles) {
  const source = readFile(file)

  if (source.includes("admin_orphan_artist")) {
    failures.push(`${file}: app code must not call admin_orphan_artist`)
  }
}

for (const apiRouteFile of listFiles("app/server/api")) {
  const normalizedPath = apiRouteFile.toLowerCase()

  if (/\/orphan(?:\.|\/)/.test(normalizedPath)) {
    failures.push(`${apiRouteFile}: API routes must not expose /orphan`)
  }
}

for (const rule of guardrails) {
  if (!fileExists(rule.file)) {
    failures.push(`${rule.file}: required financial guardrail file is missing`)
    continue
  }

  const source = readFile(rule.file)

  for (const check of rule.checks) {
    if (!check.test(source)) {
      failures.push(`${rule.file}: ${check.label}`)
    }
  }
}

if (failures.length) {
  console.error("Financial accuracy guardrails failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Financial accuracy guardrails passed.")
