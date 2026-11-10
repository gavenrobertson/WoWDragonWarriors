-- Unopened chests found while playing (or bought for later). One row per user and chest type.
create table arcade_chest_inv (
  user_id text not null references users(id) on delete cascade,
  chest_id text not null,
  count integer not null default 0,
  primary key (user_id, chest_id)
);
