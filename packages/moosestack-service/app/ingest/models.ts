import { OlapTable, Decimal, LowCardinality } from "@514labs/moose-lib";

// ---- User ----
export interface User {
  userId: string;
  createdAt: Date;
  name: string;
  email: string;
  region: string & LowCardinality;
  plan: "free" | "pro" | "enterprise";
}

export const UserTable = new OlapTable<User>("users", {
  orderByFields: ["region", "userId"],
});

// ---- Product ----
export interface Product {
  productId: string;
  name: string;
  category: string & LowCardinality;
  unitPrice: Decimal<10, 2>;
  createdAt: Date;
}

export const ProductTable = new OlapTable<Product>("products", {
  orderByFields: ["category", "productId"],
});

// ---- Transaction ----
export interface Transaction {
  transactionId: string;
  timestamp: Date;
  userId: string;
  status: "pending" | "completed" | "failed" | "refunded";
  region: string & LowCardinality;
  currency: string & LowCardinality;
  paymentMethod: string & LowCardinality;
  totalAmount: Decimal<10, 2>;
}

export const TransactionTable = new OlapTable<Transaction>("transactions", {
  orderByFields: ["userId", "timestamp"],
});

// ---- Transaction Line Item ----
export interface TransactionLineItem {
  lineItemId: string;
  transactionId: string;
  timestamp: Date;
  productId: string;
  quantity: number;
  unitPrice: Decimal<10, 2>;
  amount: Decimal<10, 2>;
}

export const TransactionLineItemTable = new OlapTable<TransactionLineItem>(
  "transaction_line_items",
  {
    orderByFields: ["transactionId", "timestamp"],
  },
);
