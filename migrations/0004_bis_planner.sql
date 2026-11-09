-- Self-service BiS planner: one item per slot per character, with the member's own source notes.
alter table bis_entries add column source_type text;   -- raid | dungeon | quest | crafted | reputation | pvp | world
alter table bis_entries add column note text;          -- e.g. "Onyxia" or "Revered with Argent Dawn"
alter table bis_entries add column updated_at text;
alter table items add column item_level integer;
alter table items add column required_level integer;
