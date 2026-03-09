# Financial Query Layer Demo

A financial services data surface with two access patterns over the same ClickHouse data:

1. **MCP** — AI chat with free SQL generation via the Model Context Protocol
2. **Dashboard** — hand-crafted Express API endpoints powering a Next.js revenue dashboard

Companion demo for the blog post [Define Once, Use Everywhere](https://docs.fiveonefour.com/guides/chat-in-your-app/tutorial). Built with [MooseStack](https://docs.fiveonefour.com).

| Without query layer ([`7da601e`](https://github.com/514-labs/financial-query-layer-demo/tree/7da601e)) | With query layer |
|---|---|
| <img src="bad-prompt.gif" alt="Vibe SQL gets revenue wrong" width="465"> | <img src="good-prompt.gif" alt="Query layer gets it right" width="465"> |
| AI generates SQL against raw tables — misses `WHERE status = 'completed'`, inflating revenue. Dashboard and chat show different numbers. | Revenue is defined once as `sumIf(totalAmount, status = 'completed')`. Dashboard, chat, and any future surface all use the same metric definition. |

## Quickstart

### Prerequisites

- Node.js v20+ and pnpm v8+
- Docker Desktop (running)
- Moose CLI: `bash -i <(curl -fsSL https://fiveonefour.com/install.sh) moose`
- [Anthropic API key](https://console.anthropic.com/) (for chat)

### Setup

```bash
pnpm install

cp packages/moosestack-service/.env.{example,local}
cp packages/web-app/.env.{example,local}
```

Generate auth tokens:

```bash
cd packages/moosestack-service
moose generate hash-token
```

Set environment variables (`moose generate hash-token` outputs a key pair — hash goes to backend, token goes to frontend):

| Variable | File | Value |
|---|---|---|
| `MCP_API_KEY` | `packages/moosestack-service/.env.local` | `ENV API Key` (hash) from `moose generate hash-token` |
| `MCP_API_TOKEN` | `packages/web-app/.env.local` | `Bearer Token` from `moose generate hash-token` |
| `ANTHROPIC_API_KEY` | `packages/web-app/.env.local` | Your [Anthropic API key](https://console.anthropic.com/) |

### Run

```bash
pnpm dev          # Both services
pnpm dev:moose    # Backend only
pnpm dev:web      # Frontend only
```

- Dashboard: http://localhost:3000
- Revenue API: http://localhost:4000/revenue/by-region
- MCP endpoint: http://localhost:4000/tools
- Temporal UI: http://localhost:8080

### Ports

Make sure the following ports are free before running `pnpm dev`. Change them in `packages/moosestack-service/moose.config.toml` if needed.

| Service | Port |
|---|---|
| Next.js web app | 3000 |
| MooseStack HTTP/MCP | 4000 |
| Management API | 5001 |
| Temporal | 7233 |
| Temporal UI | 8080 |
| ClickHouse HTTP | 18123 |
| ClickHouse native | 9000 |

## Data Architecture

```text
Temporal Workflow (@every 15s)
  │
  │  generates fake data via direct ClickHouse inserts
  │
  ▼
┌──────────────────────────────────────────┐
│  ClickHouse Tables                       │
│  users · products · transactions         │
│  transaction_line_items                  │
└──────────────────┬───────────────────────┘
                   │
     ┌─────────────┴─────────────┐
     │  Query Layer               │
     │  defineQueryModel()        │
     │  transactionMetrics        │
     │  revenue = sumIf(          │
     │    totalAmount,            │
     │    status = 'completed')   │
     └─────┬───────────┬─────────┘
           │           │
     buildQuery()  registerModelTools()
           │           │
     ┌─────┴─────┐   ┌┴──────────────┐
     │ /revenue  │   │ /tools (MCP)  │
     │ Express   │   │ query_         │
     │ API       │   │ transaction_   │
     │           │   │ metrics        │
     └─────┬─────┘   └────┬──────────┘
           │              │
     ┌─────┴─────┐   ┌───┴───────┐
     │ Dashboard │   │ Chat UI   │
     │ Next.js   │   │ Next.js   │
     └───────────┘   └───────────┘
```

Compare with the [pre-query-layer architecture (`7da601e`)](https://github.com/514-labs/financial-query-layer-demo/blob/7da601e/README.md#data-architecture), where the dashboard used hand-written SQL and the MCP server exposed free-form `query_clickhouse` with no shared metric definitions.

**Workflow → Tables**: A Temporal workflow runs every 15 seconds, generating ~1k transactions and ~5k line items per run with randomized volumes, weighted status distributions, and price variation.

**Tables → Query Layer**: The `transactionMetrics` query model defines revenue as `sumIf(totalAmount, status = 'completed')` — the single source of truth for all metric calculations.

**Query Layer → API**: The `/revenue` Express endpoint uses `buildQuery(transactionMetrics)` to query ClickHouse. The dashboard renders the results with tooltips showing the metric definition.

**Query Layer → MCP**: The `/tools` MCP server registers `query_transaction_metrics` via `registerModelTools()`. The AI chat calls this tool instead of writing free-form SQL, ensuring it uses the same metric definitions as the dashboard.

## Schema Design

### users

| Column | Type | Notes |
|---|---|---|
| userId | String | |
| createdAt | DateTime | |
| name | String | |
| email | String | |
| region | LowCardinality(String) | Geographic dimension |
| plan | Enum8 | free / pro / enterprise |

`ORDER BY (region, userId)`

### products

| Column | Type | Notes |
|---|---|---|
| productId | String | |
| name | String | |
| category | LowCardinality(String) | Product dimension |
| unitPrice | Decimal(10,2) | List price in USD |
| createdAt | DateTime | |

`ORDER BY (category, productId)`

### transactions

| Column | Type | Notes |
|---|---|---|
| transactionId | String | |
| timestamp | DateTime | |
| userId | String | FK to users |
| status | Enum8 | pending / completed / failed / refunded |
| region | LowCardinality(String) | Geographic dimension |
| currency | LowCardinality(String) | USD / EUR / GBP |
| paymentMethod | LowCardinality(String) | credit_card / debit_card / etc. |
| totalAmount | Decimal(10,2) | Sum of line items |

`ORDER BY (userId, timestamp)` — optimized for per-user lookups over time.

### transaction_line_items

| Column | Type | Notes |
|---|---|---|
| lineItemId | String | |
| transactionId | String | FK to transactions |
| timestamp | DateTime | Inherited from parent |
| productId | String | FK to products |
| quantity | Float64 | Units purchased |
| unitPrice | Decimal(10,2) | Price at time of purchase |
| amount | Decimal(10,2) | quantity × unitPrice |

`ORDER BY (transactionId, timestamp)` — optimized for fetching all items in a transaction.

## Connecting MCP Clients

The MCP server at `/tools` exposes `query_clickhouse` and `get_data_catalog`. Connect any MCP client:

### Claude Code

```bash
claude mcp add --transport http moose-tools http://localhost:4000/tools --header "Authorization: Bearer <your_bearer_token>"
```

### mcp.json (Cursor, Claude Desktop, etc.)

```json
{
  "mcpServers": {
    "moose-tools": {
      "transport": "http",
      "url": "http://localhost:4000/tools",
      "headers": {
        "Authorization": "Bearer <your_bearer_token>"
      }
    }
  }
}
```

Replace `<your_bearer_token>` with the Bearer Token from `moose generate hash-token`.

## Troubleshooting

### Port Already in Use

Update `packages/moosestack-service/moose.config.toml`:

```toml
[http_server_config]
port = 4001
```

### "ANTHROPIC_API_KEY not set"

Add your key to `packages/web-app/.env.local` and restart the Next.js dev server.

### CORS Errors

Ensure the MooseStack backend is running — the `/revenue` API includes CORS middleware for cross-origin requests from the frontend.

## Learn More

- [Chat in Your App Tutorial](https://docs.fiveonefour.com/guides/chat-in-your-app/tutorial)
- [MooseStack Documentation](https://docs.fiveonefour.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
