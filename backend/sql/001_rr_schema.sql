-- Schema rr: the place cache and search history. Idempotent; applied by hand
-- with scripts/apply-schema.sh (the apps never run DDL).

IF SCHEMA_ID('rr') IS NULL
    EXEC('CREATE SCHEMA rr');
GO

-- Google place fields, refreshed when older than 30 days (Google's limit for
-- data other than the place id). Shared by all users.
IF OBJECT_ID('rr.places', 'U') IS NULL
CREATE TABLE rr.places (
    id             NVARCHAR(300)  NOT NULL CONSTRAINT pk_rr_places PRIMARY KEY,
    name           NVARCHAR(300)  NOT NULL,
    address        NVARCHAR(500)  NULL,
    postcode       NVARCHAR(16)   NULL,
    neighbourhood  NVARCHAR(200)  NULL,
    lat            FLOAT          NULL,
    lng            FLOAT          NULL,
    rating         DECIMAL(2, 1)  NULL,
    review_count   INT            NULL,
    price_tier     NVARCHAR(4)    NULL,
    open_now       BIT            NULL,
    photo_ref      NVARCHAR(500)  NULL,
    type_label     NVARCHAR(200)  NULL,
    types          NVARCHAR(2000) NULL,  -- JSON array of Google types
    hygiene_rating TINYINT        NULL,  -- FSA FHRS 0 to 5; NULL = not rated
    fetched_at     DATETIME2      NOT NULL
);
GO

-- One row per search a user ran. A result list is reused for the same
-- search_key (normalised query and origin) for 24 hours, across users.
IF OBJECT_ID('rr.searches', 'U') IS NULL
CREATE TABLE rr.searches (
    id         NVARCHAR(36)  NOT NULL CONSTRAINT pk_rr_searches PRIMARY KEY,
    user_id    NVARCHAR(64)  NOT NULL,
    query      NVARCHAR(300) NOT NULL,
    origin     NVARCHAR(200) NULL,
    search_key NVARCHAR(510) NOT NULL,
    created_at DATETIME2     NOT NULL,
    status     NVARCHAR(20)  NOT NULL CONSTRAINT df_rr_searches_status DEFAULT 'done'
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_rr_searches_key')
    CREATE INDEX ix_rr_searches_key ON rr.searches (search_key, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_rr_searches_user')
    CREATE INDEX ix_rr_searches_user ON rr.searches (user_id, created_at DESC);
GO

IF OBJECT_ID('rr.search_results', 'U') IS NULL
CREATE TABLE rr.search_results (
    search_id NVARCHAR(36)  NOT NULL
        CONSTRAINT fk_rr_search_results_search REFERENCES rr.searches (id),
    place_id  NVARCHAR(300) NOT NULL
        CONSTRAINT fk_rr_search_results_place REFERENCES rr.places (id),
    rank      INT           NOT NULL,
    fit_score TINYINT       NULL,
    why       NVARCHAR(500) NULL,
    CONSTRAINT pk_rr_search_results PRIMARY KEY (search_id, rank)
);
GO
