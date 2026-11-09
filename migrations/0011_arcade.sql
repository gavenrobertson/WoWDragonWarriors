-- Arcade: Dragon Marks wallet, game log, multi-step rounds (mines, hi-lo, crash), cosmetics and what each user has equipped.
create table arcade_wallets (
  user_id text primary key references users(id) on delete cascade,
  marks integer not null default 0,
  lifetime_won integer not null default 0,
  lifetime_wagered integer not null default 0,
  daily_streak integer not null default 0,
  welcomed integer not null default 0,     -- welcome bonus claimed
  last_daily text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create table arcade_plays (
  id text primary key default (lower(hex(randomblob(16)))),
  user_id text not null references users(id) on delete cascade,
  game text not null, bet integer not null default 0, payout integer not null default 0, detail text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index arcade_plays_user_idx on arcade_plays(user_id, created_at);
create index arcade_plays_time_idx on arcade_plays(created_at);
create table arcade_rounds (
  id text primary key default (lower(hex(randomblob(16)))),
  user_id text not null references users(id) on delete cascade,
  game text not null, bet integer not null, state text not null, status text not null default 'active',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index arcade_rounds_user_idx on arcade_rounds(user_id, status);
create table cosmetics_owned (
  user_id text not null references users(id) on delete cascade,
  cosmetic_id text not null,
  acquired_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (user_id, cosmetic_id)
);
alter table users add column name_style text;
alter table users add column title text;
alter table users add column site_theme text;
