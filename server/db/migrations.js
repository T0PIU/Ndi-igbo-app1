// Schema. Written in the SQL subset that SQLite and PostgreSQL share:
// TEXT ids made by the app, BIGINT epoch-milliseconds for times, INTEGER 0/1 for flags.
// Add new migrations at the END of this list. Never edit one that has shipped.

export const MIGRATIONS = [
  {
    id: '001_initial',
    statements: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        verified_label TEXT,
        terms_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        last_login_at BIGINT
      )`,
      `CREATE TABLE profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT,
        ethnic_group TEXT,
        group_consent_at BIGINT,
        home_state TEXT,
        school TEXT,
        onboarded_at BIGINT,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE profile_genres (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        genre TEXT NOT NULL,
        PRIMARY KEY (user_id, genre)
      )`,
      `CREATE INDEX idx_profile_genres_genre ON profile_genres(genre)`,
      `CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL
      )`,
      `CREATE INDEX idx_sessions_user ON sessions(user_id)`,
      `CREATE INDEX idx_sessions_expires ON sessions(expires_at)`,
      `CREATE TABLE posts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'published',
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        contact TEXT,
        event_date TEXT,
        weekly INTEGER NOT NULL DEFAULT 0,
        is_example INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE INDEX idx_posts_kind_status ON posts(kind, status, created_at)`,
      `CREATE INDEX idx_posts_author ON posts(author_id)`,
      `CREATE TABLE reactions (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (post_id, user_id)
      )`,
      `CREATE TABLE reports (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at BIGINT NOT NULL,
        UNIQUE (post_id, reporter_id)
      )`,
      `CREATE TABLE music_playlists (
        genre TEXT PRIMARY KEY,
        spotify_uri TEXT NOT NULL,
        title TEXT,
        updated_by TEXT,
        updated_at BIGINT NOT NULL
      )`,
      `CREATE TABLE kv_cache (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      )`,
    ],
  },
  {
    id: '002_trust',
    statements: [
      'ALTER TABLE users ADD COLUMN suspended_at BIGINT',
      `CREATE TABLE verification_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        org_name TEXT NOT NULL,
        org_type TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by TEXT,
        decided_at BIGINT,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_name TEXT,
        action TEXT NOT NULL,
        target TEXT,
        detail TEXT,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE rsvps (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (post_id, user_id)
      )`,
    ],
  },
  {
    id: '003_files_reviews_blocks',
    statements: [
      `CREATE TABLE files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        size INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE reviews (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL,
        body TEXT,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (post_id, user_id)
      )`,
      `CREATE TABLE blocks (
        blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
      )`,
    ],
  },
];
