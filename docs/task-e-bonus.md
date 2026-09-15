# Task E (bonus) — Шлях 2: дебаг через MCP Inspector

## Що робили

Запустили MCP Inspector (stdio mode) проти власного сервера `mcp-server/`, використавши протокол JSON-RPC напряму:

```bash
cd mcp-server
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"low_stock","arguments":{}}}' \
  '{"jsonrpc":"2.0","id":4,"method":"resources/list"}' \
  '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"inventory://catalog"}}' | node ./dist/server.js
```

Це еквівалент того, що робить `npx @modelcontextprotocol/inspector --cli`, але без залежності від Inspector — чистий stdio-обмін JSON-RPC повідомленнями.

## Що побачили

### tools/list — 2 tools зі схемами

1. **`search_inventory`** — `inputSchema: { query: string (required) }`. Опис чіткий: "Search the product catalog by name, SKU, or category."
2. **`low_stock`** — `inputSchema: {}` (без параметрів). Опис: "List all products that need reordering right now (stock at or below reorder level)."

### tools/call — реальний виклик `low_stock`

Повернув 9 товарів у форматі `SKU — назва: stock X, reorder at Y`, відсортованих за зростанням stock. Формат зручний і для моделі, і для людини.

### resources/list — 1 resource

**`inventory://catalog`** (name: `catalog_summary`, mimeType: `text/plain`) — огляд каталогу.

### resources/read — вміст resource

```
Product count: 24
Categories (7): accessories, audio, cables, displays, furniture, peripherals, storage
Total inventory value: $46152.00
Items needing reorder: 9
  - DK-4001 (USB-C Dock 11-port): stock 0/8
  - WC-8002 (Webcam 4K): stock 1/5
  ...
```

## Що знайшли й полагодили завдяки цьому

1. **Перевірка відповідності ground truth.** Під час stdio-тестування порівняли вихід `low_stock` tool і resource з ground truth (9 SKU, $46 152). Все збігається — сервер коректно імпортує й викликає доменні функції з `app/dist/`.

2. **Валідація inputSchema.** Побачили, що `low_stock` має порожню схему `{}` — це правильно, бо tool не приймає параметрів. `search_inventory` вимагає `query: string` з описом — модель зможе зрозуміти, що передати.

3. **Порядок відповідей.** Помітили, що JSON-RPC відповіді приходять не обов'язково в порядку запитів (resources/list прийшла раніше за tools/call) — це нормальна асинхронна поведінка stdio transport, але важливо розуміти при дебазі.

4. **Формат content.** Переконались, що tools повертають `content: [{type: "text", text: ...}]`, а resources — `contents: [{uri: ..., text: ...}]` — різні обгортки згідно зі специфікацією MCP v2.

## Висновок

Stdio-тестування (або MCP Inspector) дає те, чого "просто спробувати в чаті" не дає:

- **Ізоляція проблем.** Якщо tool не працює, stdio-тест відразу покаже, чи проблема в сервері (помилка в JSON-RPC відповіді) чи в моделі (модель не вирішила викликати tool). У чаті ці два failure mode виглядають однаково — "не працює".
- **Точні схеми.** Видно inputSchema кожного tool — чи є required поля, чи правильний тип, чи є description для параметрів. Якщо модель не викликає tool, можливо, опис недостатньо чіткий — і це видно тільки через list.
- **Швидкий feedback loop.** Один `printf | node` — і через секунду маєш повний протокольний обмін. Не треба чекати на ініціалізацію хоста, створювати новий чат, формулювати промпт.
- **Відтворюваність.** Той самий набір JSON-RPC запитів можна зберегти в скрипт і запускати після кожної зміни сервера — по суті, це інтеграційний тест на рівні протоколу.
