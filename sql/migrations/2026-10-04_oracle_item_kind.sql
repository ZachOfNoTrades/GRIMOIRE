-- Oracle: items join creatures, people and places as a kind of entry.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_oracle_entities_kind')
    ALTER TABLE oracle_entities DROP CONSTRAINT CK_oracle_entities_kind;
ALTER TABLE oracle_entities ADD CONSTRAINT CK_oracle_entities_kind CHECK (kind IN ('creature','person','place','item'));
