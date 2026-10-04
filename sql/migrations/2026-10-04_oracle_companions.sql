-- Oracle: creatures, people and items can travel with the party (or one of its groups).
IF COL_LENGTH('oracle_entities', 'in_party') IS NULL
    ALTER TABLE oracle_entities ADD in_party BIT NOT NULL CONSTRAINT DF_oracle_entities_in_party DEFAULT 0;
IF COL_LENGTH('oracle_entities', 'party_group_id') IS NULL
    ALTER TABLE oracle_entities ADD party_group_id UNIQUEIDENTIFIER NULL; -- oracle_party_groups.id, no FK; NULL = with the party token
