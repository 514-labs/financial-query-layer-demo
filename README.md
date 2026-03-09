# Financial Query Layer Demo

A financial services data surface built with [MooseStack](https://docs.fiveonefour.com) and [MCP](https://modelcontextprotocol.io). Two ways to access the same data:

1. **MCP** — AI chat with free SQL generation against ClickHouse via the Model Context Protocol
2. **Dashboard** — hand-crafted Express API endpoints powering a Next.js frontend with revenue metrics

This is a companion demo for the blog post [Define Once, Use Everywhere](https://docs.fiveonefour.com/guides/chat-in-your-app/tutorial).

## Architecture

```text
┌─────────────────────────────────────────────┐
│  Next.js Frontend (localhost:3000)           │
│  ┌───────────────┐  ┌────────────────────┐  │
│  │  Dashboard     │  │  Chat UI           │  │
│  │  (hand-written │  │  (MCP client →     │  │
│  │   SQL via API) │  │   free SQL gen)    │  │
│  └───────┬───────┘  └────────┬───────────┘  │
└──────────┼───────────────────┼──────────────┘
           │                   │
┌──────────┼───────────────────┼──────────────┐
│  MooseStack (localhost:4000)                 │
│  ┌───────┴───────┐  ┌───────┴───────────┐  │
│  │ /revenue/*    │  │ /tools (MCP)      │  │
│  │ Express API   │  │ query_clickhouse  │  │
│  └───────┬───────┘  │ get_data_catalog  │  │
│          │          └───────┬───────────┘  │
│          └──────────┬───────┘              │
│               ClickHouse                    │
│  ┌──────────────────────────────────────┐  │
│  │ users | products | transactions      │  │
│  │ transaction_line_items               │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Data Model

Four tables generating data via a Temporal workflow every 15 seconds:

| Table | Purpose |
|---|---|
| `users` | Customer dimension (name, email, region, plan) |
| `products` | Product catalog (name, category, price) |
| `transactions` | Financial headers (userId, status, region, totalAmount) |
| `transaction_line_items` | Line-item detail (productId, quantity, unitPrice, amount) |

## Getting Started

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

Set environment variables:

| Variable | File | Value |
|---|---|---|
| `MCP_API_KEY` | `packages/moosestack-service/.env.local` | Hash from `moose generate hash-token` |
| `MCP_API_TOKEN` | `packages/web-app/.env.local` | Bearer Token from `moose generate hash-token` |
| `ANTHROPIC_API_KEY` | `packages/web-app/.env.local` | Your Anthropic API key |

### Run

```bash
pnpm dev          # Both services
pnpm dev:moose    # Backend only
pnpm dev:web      # Frontend only
```

- Dashboard: http://localhost:3000
- MooseStack API: http://localhost:4000
- Revenue endpoint: http://localhost:4000/revenue/by-region
- MCP endpoint: http://localhost:4000/tools
- Temporal UI: http://localhost:8080

### Ports

| Service | Port |
|---|---|
| Next.js | 3000 |
| MooseStack HTTP/MCP | 4000 |
| Management API | 5001 |
| Temporal | 7233 |
| Temporal UI | 8080 |
| ClickHouse HTTP | 18123 |
| ClickHouse native | 9000 |

## Connecting MCP Clients

The MCP server at `/tools` exposes `query_clickhouse` and `get_data_catalog` tools. Connect any MCP client:

### Claude Code

```bash
claude mcp add --transport http moose-tools http://localhost:4000/tools --header "Authorization: Bearer <your_bearer_token>"
```

### mcp.json

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

## Learn More

- [Chat in Your App Tutorial](https://docs.fiveonefour.com/guides/chat-in-your-app/tutorial)
- [MooseStack Documentation](https://docs.fiveonefour.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
