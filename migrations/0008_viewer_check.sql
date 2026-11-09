-- Whether Wowhead's 3D viewer actually has a model for the display ID (1 = yes, 0 = no, NULL = not checked yet).
alter table item_displays add column viewer_ok integer;
