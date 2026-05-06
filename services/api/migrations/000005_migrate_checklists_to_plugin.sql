-- 000005_migrate_checklists_to_plugin.sql
-- Removes the legacy public-schema checklist tables.
-- Checklist data is now owned exclusively by the com.paca.checklist plugin,
-- which creates its own tables in plugin_data_com_paca_checklist via its
-- bundled migration (0001_create_task_checklists.sql).
-- DROP … CASCADE removes dependent indexes and FK constraints automatically.
-- IF EXISTS makes this idempotent if already applied.

BEGIN;

DROP TABLE IF EXISTS public.task_checklist_items CASCADE;
DROP TABLE IF EXISTS public.task_checklists CASCADE;

COMMIT;
