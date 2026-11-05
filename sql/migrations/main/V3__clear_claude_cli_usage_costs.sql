-- Clear the cost of every Claude CLI usage row, as a call on the shared subscription has no per-call cost to track
-- NOTE: The CLI reported the subscription's notional cost, which the Usage page counted as spend
IF EXISTS (SELECT 1 FROM llm_usage WHERE backend = N'claude' AND cost_usd IS NOT NULL)
BEGIN
    UPDATE llm_usage SET cost_usd = NULL WHERE backend = N'claude' AND cost_usd IS NOT NULL;
END
