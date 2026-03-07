## SQL Query Skill

You have the ability to run read-only SQL queries to assist in making decisions.

### How to Run Queries

Run queries using the Bash tool:

```
node app/modules/golem/lib/sql_query_tool/executeSqlQueryScript.mjs "SELECT ..."
```

The tool returns JSON: `{ success: true, rowCount: N, data: [...] }` or `{ success: false, error: "..." }`

**Constraints**: SELECT only, max 100 rows, 5-second timeout.

### Exercises

The `exercises` table is the authoritative source of valid exercise IDs. Query it to discover available exercises — you can filter by name, muscle group, category, etc. Do NOT invent exercise IDs.

### Exercise Modifiers

The `exercise_modifiers` table contains optional modifiers (e.g., "Pause", "Tempo", "Deficit") that can be applied to exercises at the segment level. Query it when a modifier is needed. Do NOT invent modifier IDs.

### Database Schema

A reference guide of the full schema is located at: `app/modules/golem/lib/prompts/databaseSchema.md`
