import { buildQuery } from "@514labs/moose-lib";
import { defineBenchmark } from "./benchmark/core";
import { transactionMetrics } from "./dist/app/query-models/transaction-metrics.js";

const benchmarkModel = transactionMetrics;

const baseQuery = () =>
  buildQuery(benchmarkModel)
    .dimensions(["region", "month"])
    .metrics(["revenue", "totalTransactions", "completedTransactions"]);

export const benchmark = defineBenchmark({
  baseQuery,
  scenarios: [
    {
      name: "revenue-by-region-timestamp-filter",
      query: () =>
        buildQuery(benchmarkModel)
          .dimensions(["region"])
          .metrics(["revenue", "completedTransactions"])
          .filter("timestamp", "gte", "2025-06-01")
          .filter("timestamp", "lte", "2025-12-31"),
    },
    {
      name: "revenue-by-currency-paymentMethod",
      query: () =>
        buildQuery(benchmarkModel)
          .dimensions(["currency", "paymentMethod"])
          .metrics(["revenue", "completedTransactions", "avgTransactionAmount"]),
    },
    {
      name: "daily-revenue-single-region",
      query: () =>
        buildQuery(benchmarkModel)
          .dimensions(["day"])
          .metrics(["revenue", "totalTransactions"])
          .filter("region", "eq", "NA-East"),
    },
  ],
  thresholds: {
    baselineP95Ms: 500,
    scenarioRegressionRatio: 2.5,
  },
  sampling: {
    baselineRuns: 12,
    scenarioRuns: 6,
  },
});
