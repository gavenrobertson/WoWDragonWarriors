-- 3D models: cached Blizzard appearance per character and item display IDs.
alter table characters add column appearance text;          -- JSON {race, gender, options:[{optionId,choiceId}], items:[{id,slot}]}
alter table characters add column appearance_at text;
create table item_displays (
  item_id integer primary key,
  display_id integer,            -- item_display_info_id (null = no model, e.g. not found)
  inv_type text,                 -- Blizzard inventory type of the appearance (ROBE, WAIST, ...)
  source text,                   -- forever | retail | none
  cached_at text not null
);
