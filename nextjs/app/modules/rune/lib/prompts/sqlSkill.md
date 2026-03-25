## SQL Query Skill

You have the ability to run read-only SQL queries to assist in making decisions.

### How to Run Queries

Run queries using the Bash tool:

```
node app/modules/rune/lib/sql_query_tool/executeSqlQueryScript.mjs "SELECT ..."
```

The tool returns JSON: `{ success: true, rowCount: N, data: [...] }` or `{ success: false, error: "..." }`

**Constraints**: SELECT only, max 100 rows, 5-second timeout.

### Database Schema

```sql
-- Decks (card collections)
CREATE TABLE decks (
    id UNIQUEIDENTIFIER PRIMARY KEY,
    name NVARCHAR(255) UNIQUE NOT NULL,
    description NVARCHAR(MAX),
    is_archived BIT DEFAULT 0
);

-- Cards (individual flash cards)
CREATE TABLE cards (
    id UNIQUEIDENTIFIER PRIMARY KEY,
    deck_id UNIQUEIDENTIFIER NOT NULL REFERENCES decks(id),
    front NVARCHAR(MAX) NOT NULL,       -- Question/prompt side
    back NVARCHAR(MAX) NOT NULL,        -- Answer side
    notes NVARCHAR(MAX),                -- Extra context/hints
    source NVARCHAR(50) NULL,           -- 'manual', 'notion', 'ai'
    source_id NVARCHAR(500) NULL,       -- Notion page/block ID
    order_index INT NOT NULL,
    is_disabled BIT DEFAULT 0
);

-- Card Progress (spaced repetition state)
CREATE TABLE card_progress (
    id UNIQUEIDENTIFIER PRIMARY KEY,
    card_id UNIQUEIDENTIFIER UNIQUE NOT NULL REFERENCES cards(id),
    ease_factor DECIMAL(4,2) DEFAULT 2.50,
    interval_days INT DEFAULT 0,
    repetitions INT DEFAULT 0,
    next_review_at DATETIME2 NULL,
    last_reviewed_at DATETIME2 NULL
);
```

### Useful Queries

Check existing cards in a deck to avoid duplicates:

```sql
SELECT front, back FROM cards WHERE deck_id = '...' AND is_disabled = 0
```
