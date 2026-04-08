import {
  OlapTable,
  Decimal,
  LowCardinality,
  MaterializedView,
  Aggregated,
  ClickHouseEngines,
} from "@514labs/moose-lib";
// perf/candidate-b: incremental MV for daily transaction metrics

// ---- User ----

/**
 * Customer account in the platform.
 *
 * Each user belongs to a single geographic region and subscription plan.
 * The `region` field is the primary join key to `transactions` and is
 * used as a top-level dimension in revenue reporting.
 */
export interface User {
  /** Unique identifier for the user (UUID). */
  userId: string;
  /** Account creation timestamp. */
  createdAt: Date;
  /** Full display name. */
  name: string;
  /** Email address (unique per user). */
  email: string;
  /** Geographic region: NA-East, NA-West, EU-West, EU-Central, APAC, LATAM. */
  region: string & LowCardinality;
  /** Subscription tier. */
  plan: "free" | "pro" | "enterprise";
}

/**
 * Users table — ordered by (region, userId) for efficient regional lookups
 * and per-user queries within a region.
 */
export const UserTable = new OlapTable<User>("users", {
  orderByFields: ["region", "userId"],
});

// ---- Product ----

/**
 * Product in the catalog.
 *
 * Products are grouped by category and have a fixed list price (`unitPrice`).
 * The actual price at time of purchase is stored on the line item, not here.
 */
export interface Product {
  /** Unique identifier for the product (UUID). */
  productId: string;
  /** Human-readable product name. */
  name: string;
  /** Product category: Electronics, Software, Services, Hardware, Consulting. */
  category: string & LowCardinality;
  /** List price in USD. */
  unitPrice: Decimal<10, 2>;
  /** When the product was added to the catalog. */
  createdAt: Date;
}

/**
 * Products table — ordered by (category, productId) for efficient
 * category-level queries and individual product lookups.
 */
export const ProductTable = new OlapTable<Product>("products", {
  orderByFields: ["category", "productId"],
});

// ---- Transaction ----

/**
 * Financial transaction header.
 *
 * Represents a single purchase event. The `status` field is critical for
 * business metrics — **revenue is defined as the sum of `totalAmount`
 * where `status = 'completed'`**. Other statuses (pending, failed, refunded)
 * are excluded from revenue calculations.
 *
 * `totalAmount` is denormalized (sum of line item amounts) so revenue
 * queries don't require a JOIN to `transaction_line_items`.
 */
export interface Transaction {
  /** Unique identifier for the transaction (UUID). */
  transactionId: string;
  /** When the transaction occurred. */
  timestamp: Date;
  /** Foreign key to `users.userId`. */
  userId: string;
  /**
   * Transaction lifecycle status.
   * - `pending`   — awaiting processing
   * - `completed` — successfully settled (counts toward revenue)
   * - `failed`    — payment declined or error
   * - `refunded`  — reversed after completion
   */
  status: "pending" | "completed" | "failed" | "refunded";
  /** Geographic region (denormalized from user for efficient filtering). */
  region: string & LowCardinality;
  /** ISO currency code. */
  currency: string & LowCardinality;
  /** Payment instrument used. */
  paymentMethod: string & LowCardinality;
  /** Sum of all line item amounts for this transaction (in `currency`). */
  totalAmount: Decimal<10, 2>;
}

/**
 * Transactions table — ordered by (userId, timestamp) for efficient
 * per-user lookups over time. Revenue queries filter on `status`.
 */
export const TransactionTable = new OlapTable<Transaction>("transactions", {
  orderByFields: ["userId", "timestamp"],
});

// ---- Transaction Line Item ----

/**
 * Individual line item within a transaction.
 *
 * Each transaction has 1–8 line items. The `amount` field is
 * `quantity × unitPrice` at time of purchase (unitPrice may differ
 * from the product's current list price).
 */
export interface TransactionLineItem {
  /** Unique identifier for the line item (UUID). */
  lineItemId: string;
  /** Foreign key to `transactions.transactionId`. */
  transactionId: string;
  /** Inherited from parent transaction. */
  timestamp: Date;
  /** Foreign key to `products.productId`. */
  productId: string;
  /** Units purchased. */
  quantity: number;
  /** Price per unit at time of purchase (may differ from catalog price). */
  unitPrice: Decimal<10, 2>;
  /** Total for this line: quantity × unitPrice. */
  amount: Decimal<10, 2>;
}

/**
 * Line items table — ordered by (transactionId, timestamp) for efficient
 * retrieval of all items belonging to a single transaction.
 */
export const TransactionLineItemTable = new OlapTable<TransactionLineItem>(
  "transaction_line_items",
  {
    orderByFields: ["transactionId", "timestamp"],
  },
);

// ---- Transaction Metrics Daily (Incremental MV) ----

/**
 * Pre-aggregated daily transaction metrics.
 *
 * This is the target table for an AggregatingMergeTree materialized view
 * that incrementally aggregates transaction data by (region, currency,
 * paymentMethod, day). Queries against this table read thousands of rows
 * instead of hundreds of thousands, dramatically reducing latency for
 * dashboard and MCP tool queries.
 *
 * Columns use `Aggregated<fn, argTypes>` to map to ClickHouse
 * `AggregateFunction(fn, argTypes...)` storage. At query time, use the
 * corresponding `-Merge` combinators (e.g. `sumIfMerge(revenue)`).
 */
export interface TransactionMetricsDaily {
  region: string & LowCardinality;
  currency: string & LowCardinality;
  paymentMethod: string & LowCardinality;
  day: Date;
  /** AggregateFunction(sumIf, Decimal(10,2), LowCardinality(String)) — revenue from completed txns */
  revenue: number & Aggregated<"sumIf", [Decimal<10, 2>, string & LowCardinality]>;
  /** AggregateFunction(count) — total transaction count */
  totalTransactions: number & Aggregated<"count">;
  /** AggregateFunction(countIf, LowCardinality(String)) — completed count */
  completedTransactions: number & Aggregated<"countIf", [string & LowCardinality]>;
  /** AggregateFunction(countIf, LowCardinality(String)) — failed count */
  failedTransactions: number & Aggregated<"countIf", [string & LowCardinality]>;
  /** AggregateFunction(countIf, LowCardinality(String)) — refunded count */
  refundedTransactions: number & Aggregated<"countIf", [string & LowCardinality]>;
  /** AggregateFunction(countIf, LowCardinality(String)) — pending count */
  pendingTransactions: number & Aggregated<"countIf", [string & LowCardinality]>;
  /** AggregateFunction(sumIf, Decimal(10,2), LowCardinality(String)) — refunded amount */
  refundedAmount: number & Aggregated<"sumIf", [Decimal<10, 2>, string & LowCardinality]>;
  /** AggregateFunction(sumIf, Decimal(10,2), LowCardinality(String)) — pending amount */
  pendingAmount: number & Aggregated<"sumIf", [Decimal<10, 2>, string & LowCardinality]>;
  /** AggregateFunction(sumIf, Decimal(10,2), LowCardinality(String)) — sum(totalAmount) for completed (numerator of avg) */
  totalAmountSum: number & Aggregated<"sumIf", [Decimal<10, 2>, string & LowCardinality]>;
  /** AggregateFunction(countIf, LowCardinality(String)) — count where completed (denominator of avg) */
  totalAmountCount: number & Aggregated<"countIf", [string & LowCardinality]>;
}

/**
 * Target table for the daily transaction metrics MV.
 * Uses AggregatingMergeTree engine, ordered by (region, day) for
 * efficient region-first then time-range queries.
 */
export const TransactionMetricsDailyTable = new OlapTable<TransactionMetricsDaily>(
  "transaction_metrics_daily",
  {
    orderByFields: ["region", "day"],
    engine: ClickHouseEngines.AggregatingMergeTree,
  },
);

/**
 * Incremental materialized view that populates `transaction_metrics_daily`
 * from inserts into the `transactions` table. Uses `-State` combinators
 * so ClickHouse can merge partial aggregates across inserts.
 */
export const transactionMetricsDailyMV = new MaterializedView<TransactionMetricsDaily>({
  materializedViewName: "transaction_metrics_daily_mv",
  selectStatement: `
    SELECT
      region,
      currency,
      paymentMethod,
      toDate(timestamp) AS day,
      sumIfState(totalAmount, status = 'completed') AS revenue,
      countState() AS totalTransactions,
      countIfState(status = 'completed') AS completedTransactions,
      countIfState(status = 'failed') AS failedTransactions,
      countIfState(status = 'refunded') AS refundedTransactions,
      countIfState(status = 'pending') AS pendingTransactions,
      sumIfState(totalAmount, status = 'refunded') AS refundedAmount,
      sumIfState(totalAmount, status = 'pending') AS pendingAmount,
      sumIfState(totalAmount, status = 'completed') AS totalAmountSum,
      countIfState(status = 'completed') AS totalAmountCount
    FROM transactions
    GROUP BY region, currency, paymentMethod, day
  `,
  selectTables: [TransactionTable],
  targetTable: TransactionMetricsDailyTable,
});
