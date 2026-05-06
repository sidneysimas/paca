-- 000006_seed_checklist_plugin.sql
-- Registers the first-party com.paca.checklist plugin in the plugin registry.
-- The manifest JSON mirrors plugins/first-party/checklist/plugin.json.
-- ON CONFLICT DO NOTHING makes this idempotent (safe to re-apply).

BEGIN;

INSERT INTO plugins (id, name, version, manifest, enabled, installed_at, updated_at)
VALUES (
    'b1a2e3f4-0000-4000-8000-000000000001',
    'com.paca.checklist',
    '0.1.0',
    '{
        "id": "com.paca.checklist",
        "displayName": "Checklist",
        "description": "Adds named checklists with checkable items to tasks.",
        "version": "0.1.0",
        "permissions": ["db.read", "db.write", "events.subscribe"],
        "backend": {
            "eventSubscriptions": ["task.deleted"],
            "routes": [
                { "method": "GET",    "path": "/tasks/:taskId/checklists" },
                { "method": "POST",   "path": "/tasks/:taskId/checklists" },
                { "method": "PATCH",  "path": "/tasks/:taskId/checklists/:checklistId" },
                { "method": "DELETE", "path": "/tasks/:taskId/checklists/:checklistId" },
                { "method": "POST",   "path": "/tasks/:taskId/checklists/:checklistId/items" },
                { "method": "PATCH",  "path": "/tasks/:taskId/checklists/:checklistId/items/:itemId" },
                { "method": "DELETE", "path": "/tasks/:taskId/checklists/:checklistId/items/:itemId" }
            ]
        },
        "frontend": {
            "remoteEntryUrl": "http://localhost:5201/assets/remoteEntry.js",
            "extensionPoints": [
                {
                    "point": "task.detail.section",
                    "component": "ChecklistsSection",
                    "order": 10
                }
            ]
        }
    }',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
