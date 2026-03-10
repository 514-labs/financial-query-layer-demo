/**
 * Materialized View: Latest Transaction Status Per User
 *
 * Demonstrates the "latest per entity" pattern using AggregatingMergeTree
 * with argMaxState — the same approach needed for "latest airborne status
 * per hex" in aviation, or any "most recent state per key" use case.
 *
 * ## How it works
 *
 * 1. Every transaction insert fires the MV, which groups by (region, userId)
 *    and computes argMaxState(status, timestamp) — the status from the row
 *    with the highest timestamp.
 *
 * 2. AggregatingMergeTree correctly merges argMaxState values during
 *    background compaction — no dedup issues.
 *
 * 3. When columns with `Aggregated` annotations are interpolated into
 *    sql`` template literals (via table.columns.xxx), moose-lib auto-applies
 *    the -Merge combinator (e.g., argMaxMerge(`latestStatus`)). This means
 *    defineQueryModel can reference these columns transparently — they just
 *    need to be wired as **metrics** (not dimensions), since -Merge functions
 *    are aggregates and can't go in GROUP BY.
 */
import {
  OlapTable,
  MaterializedView,
  ClickHouseEngines,
  Aggregated,
  SimpleAggregated,
  LowCardinality,
  Decimal,
  DateTime,
  sql,
} from "@514labs/moose-lib";
import { TransactionTable } from "../ingest/models";

// ---- Target table: one row per (region, userId), auto-merged on insert ----

export interface LatestUserStatus {
  /** Geographic region — plain column, safe for GROUP BY dimensions. */
  region: string & LowCardinality;
  /** The user whose latest status we're tracking — plain column. */
  userId: string;
  /**
   * Most recent transaction status, resolved via argMax(status, timestamp).
   * Stored as AggregateFunction(argMax, String, DateTime).
   * moose-lib auto-applies argMaxMerge() when referenced in sql``.
   */
  latestStatus: string & Aggregated<"argMax", [string, Date]>;
  /**
   * Most recent transaction amount, resolved via argMax(totalAmount, timestamp).
   * Stored as AggregateFunction(argMax, Decimal(10,2), DateTime).
   */
  latestAmount: Decimal<10, 2> & Aggregated<"argMax", [Decimal<10, 2>, Date]>;
  /** Timestamp of the most recent transaction. */
  lastSeen: DateTime & SimpleAggregated<"max", DateTime>;
  /** Total number of transactions for this user (running count). */
  txCount: number & SimpleAggregated<"sum", number>;
}

export const LatestUserStatusTable = new OlapTable<LatestUserStatus>(
  "latest_user_status",
  {
    engine: ClickHouseEngines.AggregatingMergeTree,
    orderByFields: ["region", "userId"],
  },
);

// ---- Materialized View: fires on every insert to transactions ----

export const LatestUserStatusMV = new MaterializedView<LatestUserStatus>({
  materializedViewName: "mv_latest_user_status",
  selectTables: [TransactionTable],
  targetTable: LatestUserStatusTable,
  selectStatement: sql`
    SELECT
      ${TransactionTable.columns.region}            AS region,
      ${TransactionTable.columns.userId}            AS userId,
      argMaxState(${TransactionTable.columns.status}, ${TransactionTable.columns.timestamp})      AS latestStatus,
      argMaxState(${TransactionTable.columns.totalAmount}, ${TransactionTable.columns.timestamp})  AS latestAmount,
      max(${TransactionTable.columns.timestamp})    AS lastSeen,
      count()                                       AS txCount
    FROM ${TransactionTable}
    GROUP BY
      ${TransactionTable.columns.region},
      ${TransactionTable.columns.userId}
  `,
});
