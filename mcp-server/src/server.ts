import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import {
  loadCatalog,
  searchProducts,
  findBySku,
  lowStock,
  inventoryValue,
  categories,
} from "../../app/dist/index.js";

const server = new McpServer({
  name: "catalog-server",
  version: "1.0.0",
});

// ── Tool 1: search_inventory ─────────────────────────────────────────────
server.registerTool(
  "search_inventory",
  {
    description:
      "Search the product catalog by name, SKU, or category. Use when the " +
      "user asks what products exist or asks about a specific item.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Free-text match on product name, SKU, or category"),
    }),
  },
  async ({ query }) => {
    const results = searchProducts(loadCatalog(), query);
    return {
      content: [
        {
          type: "text" as const,
          text:
            results.length === 0
              ? `No products matched "${query}".`
              : results
                  .map(
                    (p) =>
                      `${p.sku} — ${p.name} (${p.category}) · $${p.price} · stock ${p.stock}/${p.reorderLevel}`,
                  )
                  .join("\n"),
        },
      ],
    };
  },
);

// ── Tool 2: low_stock ────────────────────────────────────────────────────
server.registerTool(
  "low_stock",
  {
    description:
      "List all products that need reordering right now (stock at or below " +
      "reorder level). Use when the user asks which items are low on stock, " +
      "need restocking, or need to be reordered.",
    inputSchema: z.object({}),
  },
  async () => {
    const items = lowStock(loadCatalog());
    return {
      content: [
        {
          type: "text" as const,
          text:
            items.length === 0
              ? "All products are above their reorder level."
              : items
                  .map(
                    (p) =>
                      `${p.sku} — ${p.name}: stock ${p.stock}, reorder at ${p.reorderLevel}`,
                  )
                  .join("\n"),
        },
      ],
    };
  },
);

// ── Resource: inventory://catalog ────────────────────────────────────────
server.registerResource(
  "catalog_summary",
  "inventory://catalog",
  {
    description:
      "Overview of the product catalog: total products, categories, " +
      "total inventory value, and items needing reorder.",
    mimeType: "text/plain",
  },
  async () => {
    const catalog = loadCatalog();
    const cats = categories(catalog);
    const value = inventoryValue(catalog);
    const reorder = lowStock(catalog);

    const text = [
      `Product count: ${catalog.length}`,
      `Categories (${cats.length}): ${cats.join(", ")}`,
      `Total inventory value: $${value.toFixed(2)}`,
      `Items needing reorder: ${reorder.length}`,
      reorder.length > 0
        ? reorder.map((p) => `  - ${p.sku} (${p.name}): stock ${p.stock}/${p.reorderLevel}`).join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      contents: [
        {
          uri: "inventory://catalog",
          text,
        },
      ],
    };
  },
);

// ── Connect ──────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
