-- Oracle: an entry can be down (dead or out of the fight) and still stay on the map.
IF COL_LENGTH('oracle_entities', 'is_down') IS NULL
    ALTER TABLE oracle_entities ADD is_down BIT NOT NULL CONSTRAINT DF_oracle_entities_is_down DEFAULT 0;
