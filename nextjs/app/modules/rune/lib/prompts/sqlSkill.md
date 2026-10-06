## SQL Query Skill

You have the ability to run read-only SQL queries to assist in making decisions.

### How to Run Queries

Run queries using the Bash tool, always passing the user ID as the first argument:

```
node app/modules/rune/lib/sql_query_tool/executeSqlQueryScript.mjs "{{USER_ID}}" "SELECT ..."
```

The tool returns JSON: `{ success: true, rowCount: N, data: [...] }` or `{ success: false, error: "..." }`

**Constraints**: SELECT only, max 100 rows, 5-second timeout.

### User Scoping

The `@userId` parameter is automatically bound server-side. You MUST include `WHERE user_id = @userId` (or `AND user_id = @userId`) when querying any user-owned table. Do NOT hardcode user IDs.

**User-owned tables** (require `@userId`): decks, cards, card_progress, card_reviews, collections, study_sessions, rune_settings

### Database Schema

```sql
-- Decks (card collections)
CREATE TABLE decks (
    id UNIQUEIDENTIFIER PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    is_archived BIT DEFAULT 0
);

-- Cards (individual flash cards)
CREATE TABLE cards (
    id UNIQUEIDENTIFIER PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
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
    user_id UNIQUEIDENTIFIER NOT NULL,
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
SELECT front, back FROM cards WHERE deck_id = '...' AND user_id = @userId AND is_disabled = 0
```
