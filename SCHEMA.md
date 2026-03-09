# Schema Design

Four tables generating data via a Temporal workflow every 15 seconds.

## users

| Column | Type | Notes |
|---|---|---|
| userId | String | |
| createdAt | DateTime | |
| name | String | |
| email | String | |
| region | LowCardinality(String) | Geographic dimension |
| plan | Enum8 | free / pro / enterprise |

`ORDER BY (region, userId)`

## products

| Column | Type | Notes |
|---|---|---|
| productId | String | |
| name | String | |
| category | LowCardinality(String) | Product dimension |
| unitPrice | Decimal(10,2) | List price in USD |
| createdAt | DateTime | |

`ORDER BY (category, productId)`

## transactions

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

## transaction_line_items

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
