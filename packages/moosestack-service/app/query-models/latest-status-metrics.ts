/**
 * Latest Status Metrics — query model on the AggregatingMergeTree MV.
 *
 * This proves that defineQueryModel works on MV target tables with
 * Aggregated columns. The key insight from the moose-lib source:
 *
 * When a Column with an `aggregationFunction` annotation is interpolated
 * into a sql`` template literal, moose-lib auto-applies the -Merge
 * combinator (index.mjs:1071-1078). So `table.columns.latestStatus`
 * (which has Aggregated<"argMax">) becomes `argMaxMerge(\`latestStatus\`)`
 * in the generated SQL.
 *
 * This means:
 * - Plain columns (region, userId) → dimensions (GROUP BY)
 * - Aggregated columns (latestStatus, latestAmount) → metrics (SELECT only)
 *   Referenced via sql`${LatestUserStatusTable.columns.latestStatus}` which
 *   auto-expands to argMaxMerge(`latestStatus`).
 *
 * Pattern: MV pre-computes "latest per user" → query model aggregates
 * across users with standard GROUP BY on plain dimensions.
 */
import { defineQueryModel, sql, count } from "@514labs/moose-lib";
import {
  LatestUserStatusTable,
} from "../materializations/latest-user-status";

export const latestStatusMetrics = defineQueryModel({
  name: "query_latest_status_metrics",
  description:
    "User status metrics based on each user's most recent transaction. " +
    "Powered by an AggregatingMergeTree MV that tracks latest transaction per user. " +
    "Use this to answer questions like 'how many users last transacted with a failure' " +
    "or 'distribution of latest transaction status by region'. " +
    "Dimensions: region. " +
    "Metrics: latestStatus (resolved via argMaxMerge), userCount, avgLatestAmount. " +
    "Filters: region.",

  table: LatestUserStatusTable,

  dimensions: {
    region: {
      column: "region",
      description:
        "Geographic region (plain column, safe for GROUP BY)",
    },
    userId: {
      column: "userId",
      description:
        "Individual user — use with region to get per-user latest status breakdown",
    },
  },

  metrics: {
    userCount: {
      agg: count(),
      as: "userCount",
      description: "Number of unique users",
    },
    latestStatus: {
      agg: sql`${LatestUserStatusTable.columns.latestStatus}`,
      as: "latestStatus",
      description:
        "Most recent transaction status per user — auto-applies argMaxMerge(). " +
        "Only meaningful when grouped by userId or used with GROUP BY region + userId.",
    },
    latestAmount: {
      agg: sql`${LatestUserStatusTable.columns.latestAmount}`,
      as: "latestAmount",
      description:
        "Most recent transaction amount per user — auto-applies argMaxMerge()",
    },
    totalTransactions: {
      agg: sql`sum(txCount)`,
      as: "totalTransactions",
      description: "Total transaction count across all users in the group",
    },
  },

  filters: {
    region: {
      column: "region",
      operators: ["eq", "in"] as const,
      description: "Filter by geographic region",
    },
  },

  sortable: [
    "userCount",
    "totalTransactions",
    "region",
  ] as const,

  defaults: {
    metrics: ["userCount", "latestStatus", "totalTransactions"],
    dimensions: [],
    orderBy: [],
    limit: 100,
    maxLimit: 1000,
  },
});
