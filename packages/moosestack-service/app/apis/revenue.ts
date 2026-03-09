import express from "express";
import cors from "cors";
import { WebApp, getMooseUtils } from "@514labs/moose-lib";

const app = express();
app.use(express.json());
app.use(cors());

// Dashboard handler — hand-written SQL
app.get("/by-region", async (_req, res) => {
  const { client } = await getMooseUtils();

  try {
    const result = await client.query.client.query({
      query: `SELECT region, sum(totalAmount) as revenue
              FROM transactions
              WHERE status = 'completed'
              GROUP BY region
              ORDER BY revenue DESC`,
      format: "JSONEachRow",
    });
    const data = await result.json();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export const revenueApi = new WebApp("revenue", app, {
  mountPath: "/revenue",
});
