-- Signed-in users, keyed by the Easy Auth principal object id. Access
-- control stays in Entra; this table only records who came. is_admin is set
-- by hand for the owner's row. Idempotent.

IF OBJECT_ID('rr.users', 'U') IS NULL
CREATE TABLE rr.users (
    id           NVARCHAR(64)  NOT NULL CONSTRAINT pk_rr_users PRIMARY KEY,
    display_name NVARCHAR(300) NULL,
    email        NVARCHAR(320) NULL,
    is_admin     BIT           NOT NULL CONSTRAINT df_rr_users_is_admin DEFAULT 0,
    created_at   DATETIME2     NOT NULL,
    last_seen_at DATETIME2     NOT NULL
);
GO
