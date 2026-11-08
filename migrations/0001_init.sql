-- Dragon Warriors hub — Cloudflare D1 (SQLite) schema.
-- Ported from the handoff's Postgres schema. Conventions:
--   ids      TEXT (random hex), times TEXT ISO-8601 UTC ("2026-12-09T02:00:00.000Z"),
--   booleans INTEGER 0/1, json/array columns TEXT holding JSON.
PRAGMA foreign_keys = ON;

create table users (
  id text primary key default (lower(hex(randomblob(16)))),
  bnet_id text unique not null,
  battletag text not null,
  discord_id text unique,
  main_character_id text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table guild_ranks (
  "index" integer primary key,
  name text not null,
  can_sign_up integer not null default 1,
  can_wishlist integer not null default 0,
  can_run_raids integer not null default 0,
  can_award_loot integer not null default 0,
  is_admin integer not null default 0
);

create table characters (
  id text primary key default (lower(hex(randomblob(16)))),
  user_id text references users(id) on delete set null,
  slug text unique not null,
  name text not null,
  surname text not null default '',
  level integer, class text, race text, spec text, role text,
  guild_rank integer,
  last_login_at text, render_url text, synced_at text,
  claimed integer not null default 0,        -- shown on the owner's hub account
  in_guild integer not null default 0,       -- present in the guild roster
  equipment text,                            -- JSON [{slot,name,quality,itemId}]
  stats text,                                -- JSON [{label,value}]
  professions text,                          -- JSON [{name,skill,max}]
  legacy text,                               -- JSON {rank,pct,milestones}
  attunements text not null default '[]',    -- JSON ["onyxia"]
  fire_resistance integer,
  attendance_pct real                        -- cached from Warcraft Logs import
);
create index characters_user_idx on characters(user_id);

create table items (
  id integer primary key, name text not null, quality text, slot text, icon_url text, cached_at text,
  slot_detail text, roles text not null default '[]'
);

create table item_sources (
  item_id integer not null references items(id), type text not null, raid text, boss text, zone text not null,
  map_x real, map_y real, how text, map_label text,
  primary key (item_id, type, zone)
);

create table bis_entries (
  character_id text not null references characters(id) on delete cascade, phase text not null, slot text not null,
  item_id integer not null references items(id), status text not null default 'need',
  primary key (character_id, phase, slot, item_id)
);

create table wishlist_items (
  character_id text not null references characters(id) on delete cascade, item_id integer not null references items(id),
  rank integer not null, approved integer not null default 0, locked_at text,
  primary key (character_id, item_id)
);

create table raid_events (
  id text primary key default (lower(hex(randomblob(16)))),
  raid text not null, name text, kind text, starts_at text not null, size integer,
  leader_id text references characters(id) on delete set null, discord_message_id text,
  comp_needs text, requirements text   -- JSON
);

create table signups (
  event_id text not null references raid_events(id) on delete cascade,
  character_id text not null references characters(id) on delete cascade,
  status text not null, note text, consumables integer not null default 0,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (event_id, character_id)
);

create table loot_awards (
  id text primary key default (lower(hex(randomblob(16)))),
  event_id text references raid_events(id) on delete set null, item_id integer not null references items(id),
  character_id text not null references characters(id) on delete cascade, method text, reason text, boss text,
  awarded_by text references users(id) on delete set null,
  awarded_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table attendance (
  event_id text not null references raid_events(id) on delete cascade, character_id text not null references characters(id) on delete cascade,
  state text, source text, primary key (event_id, character_id)
);

create table applications (
  id text primary key default (lower(hex(randomblob(16)))),
  user_id text references users(id) on delete cascade, character_slug text, role text, logs_url text, availability text, about text,
  status text not null default 'pending', decided_by text references users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table announcements (
  id text primary key default (lower(hex(randomblob(16)))),
  title text, body text, author_id text references users(id) on delete set null, posted_to_discord integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table craft_requests (
  id text primary key default (lower(hex(randomblob(16)))),
  requester_id text references characters(id) on delete cascade, item_name text, quantity integer not null default 1,
  crafter_id text references characters(id) on delete set null, status text not null default 'open',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table bank_snapshots (
  id text primary key default (lower(hex(randomblob(16)))),
  gold integer, items text, uploaded_by text references users(id) on delete set null,
  uploaded_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table settings (key text primary key, value text);   -- JSON values

-- Every sync job records its runs; Admin › Sync health reads the latest per job.
create table sync_runs (
  id integer primary key autoincrement, job text not null, status text not null, value text, note text,
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')), finished_at text
);
create index sync_runs_job_idx on sync_runs(job, started_at);

-- Server-side sessions (the cookie only carries a random id).
create table sessions (
  id text primary key, user_id text not null references users(id) on delete cascade,
  bnet_token text, bnet_token_expires text, expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index sessions_user_idx on sessions(user_id);
