-- Raid night reminders posted to Discord (once per event).
alter table raid_events add column reminded_at text;
