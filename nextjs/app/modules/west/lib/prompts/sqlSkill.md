## SQL Query Skill

You have the ability to run read-only SQL queries to assist in making decisions.

### How to Run Queries

Run queries using the Bash tool:

```
node app/modules/west/lib/sql_query_tool/executeSqlQueryScript.mjs "SELECT ..."
```

The tool returns JSON: `{ success: true, rowCount: N, data: [...] }` or `{ success: false, error: "..." }`

**Constraints**: SELECT only, max 100 rows, 5-second timeout.

### Database Schema

A reference guide of the full schema is located at: `app/modules/west/lib/prompts/databaseSchema.md`
