import { KanbanSquare, List, Map as MapIcon, Plus } from "lucide-react";
import { useState } from "react";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { ViewLayout } from "@/lib/integration-api";
import { cn } from "@/lib/utils";

interface NewViewPopoverProps {
	onSubmit: (name: string, layout: ViewLayout) => Promise<unknown>;
	isPending?: boolean;
}

const layoutIcon = (l: ViewLayout) => {
	if (l === "Board") return <KanbanSquare className="size-3.5" />;
	if (l === "Roadmap") return <MapIcon className="size-3.5" />;
	return <List className="size-3.5" />;
};

export function NewViewPopover({ onSubmit, isPending }: NewViewPopoverProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [layout, setLayout] = useState<ViewLayout>("Board");

	const submit = async () => {
		await onSubmit(name || `New ${layout}`, layout);
		setName("");
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label="Add view"
						className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
					/>
				}
			>
				<Plus className="size-3.5" />
				<span className="hidden sm:inline">Add view</span>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="end"
				className="w-64 p-0 gap-0"
				sideOffset={6}
			>
				<div className="p-3 border-b border-border/50">
					<p className="text-xs font-semibold">New view</p>
				</div>
				<div className="p-3 flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="new-view-name"
							className="text-xs text-muted-foreground"
						>
							View name
						</label>
						<input
							id="new-view-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && submit()}
							placeholder={`New ${layout}`}
							className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<p className="text-xs text-muted-foreground">Layout</p>
						<div className="flex gap-2">
							{(["Board", "Table", "Roadmap"] as ViewLayout[]).map((l) => (
								<button
									key={l}
									type="button"
									onClick={() => setLayout(l)}
									className={cn(
										"flex flex-1 items-center justify-center gap-1.5 rounded-md border py-2 text-xs font-medium transition-colors",
										layout === l
											? "border-primary bg-primary/10 text-primary"
											: "border-border text-muted-foreground hover:text-foreground",
									)}
								>
									{layoutIcon(l)}
									{l}
								</button>
							))}
						</div>
					</div>
					<button
						type="button"
						onClick={submit}
						disabled={isPending}
						className="w-full rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
					>
						{isPending ? "Creating…" : "Create view"}
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
