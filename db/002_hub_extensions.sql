-- Columns and tables the hub screens need beyond the handoff schema.

-- Cached Blizzard API data per character (refreshed by the sync jobs).
alter table characters
  add column if not exists claimed boolean not null default false,      -- shown on the user's hub account
  add column if not exists in_guild boolean not null default false,     -- present in the guild roster
  add column if not exists equipment jsonb,                             -- [{slot,name,quality,itemId}]
  add column if not exists stats jsonb,                                 -- [{label,value}]
  add column if not exists professions jsonb,                           -- [{name,skill,max}]
  add column if not exists legacy jsonb,                                -- {rank,pct,milestones:[{title,when}]}
  add column if not exists attunements text[] not null default '{}',    -- e.g. {onyxia}
  add column if not exists fire_resistance int,
  add column if not exists attendance_pct real;                         -- cached from Warcraft Logs import

create index if not exists characters_user_idx on characters(user_id);
create index if not exists characters_rank_idx on characters(guild_rank);

alter table items
  add column if not exists slot_detail text,                           -- "Head · Plate · Warrior tier 2"
  add column if not exists roles text[] not null default '{}';         -- tank|healer|melee|ranged

alter table item_sources
  add column if not exists map_label text;                             -- pin label on the schematic map
-- zone is part of the primary key, so it must never be null
alter table item_sources alter column zone set not null;

alter table raid_events
  add column if not exists name text,
  add column if not exists kind text,                                  -- "Raid · main team", "Guild event"
  add column if not exists comp_needs jsonb,                           -- [{role,need}]
  add column if not exists requirements jsonb;                         -- ["level60","attune:onyxia","fireres:150"]

alter table signups add column if not exists consumables boolean not null default false;

alter table loot_awards add column if not exists boss text;

-- Every sync job records its runs here; Admin › Sync health reads the latest per job.
create table if not exists sync_runs (
  id bigserial primary key,
  job text not null,                 -- roster | profiles | renders | warcraftlogs | discord | addon
  status text not null,              -- ok | partial | error | waiting
  value text,
  note text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sync_runs_job_idx on sync_runs(job, started_at desc);

-- Server-side sessions (the cookie only carries a random id).
create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  bnet_token text,                   -- user token, kept only for the account character refresh
  bnet_token_expires timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now());
