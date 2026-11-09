-- Site roles, assigned on the hub per Battle.net account, on top of in-game guild rank.
-- super_admin | guild_leader | officer | raid_leader | loot_master | NULL
alter table users add column site_role text;
