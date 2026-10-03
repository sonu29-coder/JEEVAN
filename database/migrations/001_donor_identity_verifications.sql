CREATE TABLE IF NOT EXISTS donor_identity_verifications (
    user_id VARCHAR(40) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    verification_status VARCHAR(16) NOT NULL
        CHECK (verification_status IN ('pending', 'verified', 'failed')),
    provider VARCHAR(40) NOT NULL,
    provider_reference VARCHAR(128) NOT NULL UNIQUE,
    verified_at TIMESTAMPTZ
);
