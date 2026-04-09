import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { slugify } from "./helpers";
import type { CustomFieldDef } from "./types";

type FieldType = "Text" | "Number" | "Date" | "Checkbox" | "Select";
const FIELD_TYPES: FieldType[] = [
	"Text",
	"Number",
	"Date",
	"Checkbox",
	"Select",
];

interface AddFieldDialogProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onAdd: (field: CustomFieldDef) => void;
}

export function AddFieldDialog({
	open,
	onOpenChange,
	onAdd,
}: AddFieldDialogProps) {
	const [displayName, setDisplayName] = useState("");
	const [fieldKey, setFieldKey] = useState("");
	const [keyManual, setKeyManual] = useState(false);
	const [fieldType, setFieldType] = useState<FieldType>("Text");
	const [required, setRequired] = useState(false);

	const reset = () => {
		setDisplayName("");
		setFieldKey("");
		setKeyManual(false);
		setFieldType("Text");
		setRequired(false);
	};

	if (!open) return null;

	const handleCreate = () => {
		if (!displayName.trim()) return;
		onAdd({
			id: crypto.randomUUID(),
			display_name: displayName.trim(),
			field_key: fieldKey || slugify(displayName),
			field_type: fieldType,
			required,
			options: [],
		});
		reset();
		onOpenChange(false);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop closes on click; keyboard handled by inner close button
		// biome-ignore lint/a11y/useKeyWithClickEvents: modal backdrop; Escape key handled by inner elements
		<div
			className="fixed inset-0 z-60 flex items-center justify-center"
			onClick={() => {
				reset();
				onOpenChange(false);
			}}
		>
			<div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" />
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation on modal content prevents backdrop close */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only; no action triggered */}
			<div
				className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-popover p-6 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-5">
					<h2 className="font-[Syne] text-base font-bold">
						Create custom field
					</h2>
					<button
						type="button"
						onClick={() => {
							reset();
							onOpenChange(false);
						}}
						className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
					>
						<X className="size-4" />
					</button>
				</div>

				<div className="space-y-4">
					{/* Display name */}
					<div className="space-y-1.5">
						<label
							htmlFor="add-field-display-name"
							className="text-sm font-medium text-foreground/70"
						>
							Display name <span className="text-destructive">*</span>
						</label>
						<input
							id="add-field-display-name"
							value={displayName}
							onChange={(e) => {
								setDisplayName(e.target.value);
								if (!keyManual) setFieldKey(slugify(e.target.value));
							}}
							placeholder="e.g. Release Tag"
							className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
						/>
					</div>

					{/* Field key */}
					<div className="space-y-1.5">
						<label
							htmlFor="add-field-key"
							className="text-sm font-medium text-foreground/70"
						>
							Field key
						</label>
						<input
							id="add-field-key"
							value={fieldKey}
							onChange={(e) => {
								setKeyManual(true);
								setFieldKey(slugify(e.target.value));
							}}
							placeholder="release_tag"
							className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
						/>
					</div>

					{/* Field type */}
					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground/70">Field type</p>
						<div className="flex flex-wrap gap-1.5">
							{FIELD_TYPES.map((ft) => (
								<button
									key={ft}
									type="button"
									onClick={() => setFieldType(ft)}
									className={cn(
										"rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
										fieldType === ft
											? "border-primary bg-primary/10 text-primary"
											: "border-border/50 text-muted-foreground hover:border-border hover:bg-muted/40",
									)}
								>
									{ft}
								</button>
							))}
						</div>
					</div>

					{/* Required toggle */}
					<div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
						<span className="text-sm text-foreground/70">Required</span>
						<button
							type="button"
							role="switch"
							aria-checked={required}
							onClick={() => setRequired(!required)}
							className={cn(
								"relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-colors",
								required
									? "border-primary bg-primary"
									: "border-border bg-muted",
							)}
						>
							<span
								className={cn(
									"inline-block size-3.5 rounded-full bg-white shadow transition-transform",
									required ? "translate-x-4" : "translate-x-0.5",
								)}
							/>
						</button>
					</div>
				</div>

				{/* Footer */}
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={() => {
							reset();
							onOpenChange(false);
						}}
						className="rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={!displayName.trim()}
						onClick={handleCreate}
						className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
					>
						Create field
					</button>
				</div>
			</div>
		</div>
	);
}
