-- Loot council votes: one vote per council member per item; cleared when the item is awarded.
create table council_votes (
  item_id integer not null references items(id),
  voter_user_id text not null references users(id) on delete cascade,
  character_id text not null references characters(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (item_id, voter_user_id)
);
