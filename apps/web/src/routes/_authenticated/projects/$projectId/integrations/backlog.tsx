import { createFileRoute } from "@tanstack/react-router";

import { IntegrationLayout } from "@/components/projects/integrations/integration-layout";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute(
	"/_authenticated/projects/$projectId/integrations/backlog",
)({
	component: BacklogPage,
});

function BacklogPage() {
	const { projectId } = Route.useParams();
	const { hasPermission } = usePermissions();

	const canCreate = hasPermission("tasks.write");
	const canEdit = hasPermission("tasks.write");
	const canManageViews = hasPermission("projects.write");

	return (
		<IntegrationLayout
			projectId={projectId}
			integrationKey={`backlog:${projectId}`}
			title="Product Backlog"
			description="All work items not assigned to a sprint."
			canCreate={canCreate}
			canEdit={canEdit}
			canManageViews={canManageViews}
			sprintId={null}
			isBacklog={true}
		/>
	);
}
