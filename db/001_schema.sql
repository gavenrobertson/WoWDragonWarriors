-- Dragon Warriors hub — Postgres schema (from the design handoff)
create extension if not exists pgcrypto;
create table users (id uuid primary key default gen_random_uuid(), bnet_id text unique not null, battletag text not null, discord_id text unique, main_character_id uuid, created_at timestamptz default now());
create table guild_ranks (index int primary key, name text not null, can_sign_up bool default true, can_wishlist bool default false, can_run_raids bool default false, can_award_loot bool default false, is_admin bool default false);
create table characters (id uuid primary key default gen_random_uuid(), user_id uuid references users(id), slug text unique not null, name text not null, surname text not null, level int, class text, race text, spec text, role text, guild_rank int references guild_ranks(index), last_login_at timestamptz, render_url text, synced_at timestamptz);
alter table users add foreign key (main_character_id) references characters(id);
create table items (id int primary key, name text not null, quality text, slot text, icon_url text, cached_at timestamptz);
create table item_sources (item_id int references items(id), type text not null, raid text, boss text, zone text, map_x real, map_y real, how text, primary key (item_id, type, zone));
create table bis_entries (character_id uuid references characters(id) on delete cascade, phase text, slot text, item_id int references items(id), status text default 'need', primary key (character_id, phase, slot, item_id));
create table wishlist_items (character_id uuid references characters(id) on delete cascade, item_id int references items(id), rank int not null, approved bool default false, locked_at timestamptz, primary key (character_id, item_id));
create table raid_events (id uuid primary key default gen_random_uuid(), raid text not null, starts_at timestamptz not null, size int, leader_id uuid references characters(id), discord_message_id text);
create table signups (event_id uuid references raid_events(id) on delete cascade, character_id uuid references characters(id), status text not null, note text, updated_at timestamptz default now(), primary key (event_id, character_id));
create table loot_awards (id uuid primary key default gen_random_uuid(), event_id uuid references raid_events(id), item_id int references items(id), character_id uuid references characters(id), method text, reason text, awarded_by uuid references users(id), awarded_at timestamptz default now());
create table attendance (event_id uuid references raid_events(id), character_id uuid references characters(id), state text, source text, primary key (event_id, character_id));
create table applications (id uuid primary key default gen_random_uuid(), user_id uuid references users(id), character_slug text, role text, logs_url text, availability text, about text, status text default 'pending', decided_by uuid references users(id), created_at timestamptz default now());
create table announcements (id uuid primary key default gen_random_uuid(), title text, body text, author_id uuid references users(id), posted_to_discord bool default false, created_at timestamptz default now());
create table craft_requests (id uuid primary key default gen_random_uuid(), requester_id uuid references characters(id), item_name text, quantity int default 1, crafter_id uuid references characters(id), status text default 'open', created_at timestamptz default now());
create table bank_snapshots (id uuid primary key default gen_random_uuid(), gold bigint, items jsonb, uploaded_by uuid references users(id), uploaded_at timestamptz default now());
create table settings (key text primary key, value jsonb);  -- loot_system, wishlist_slots, wishlist_lock_date, attendance_window
