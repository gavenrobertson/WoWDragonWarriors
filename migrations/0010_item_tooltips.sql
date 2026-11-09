-- Cached WoW-style tooltip per item (JSON ItemTip), filled from equipped items during profile sync
-- or on demand from Blizzard's item data.
alter table items add column tooltip text;
alter table items add column tooltip_at text;
