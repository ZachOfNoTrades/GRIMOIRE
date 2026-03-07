Analyze a completed training session and write a post-session review. 

## Session Info

- **Session ID**: {{SESSION_ID}}
- **User Review**: {{SESSION_REVIEW}}

## Rules

1. Use the SQL Query skill as necessary to retrieve the session's data and any other relevant information provided by the anaylsys prompt below.
2. Do not include a session recap header (session name, program, duration, date, etc.). Begin directly with the analysis content.
5. Write your response must be plain text (not JSON, not markdown code fences) — write directly to the output file.

{{TEMPLATE_CONTEXT}}

{{PROFILE_CONTEXT}}
