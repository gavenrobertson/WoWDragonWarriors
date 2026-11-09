-- Council observer pool: guildmates who aren't on the council stake Dragon Marks on who the council will pick.
create table council_pool (
  id text primary key default (lower(hex(randomblob(16)))),
  item_id integer not null,
  user_id text not null references users(id) on delete cascade,
  character_id text not null references characters(id) on delete cascade,
  stake integer not null,
  status text not null default 'open',   -- open | won | lost | refunded
  payout integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index council_pool_item_idx on council_pool(item_id, status);
