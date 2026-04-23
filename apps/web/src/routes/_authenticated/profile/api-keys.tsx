import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	apiKeysQueryOptions,
	type CreateAPIKeyResponse,
	createAPIKey,
	revokeAPIKey,
} from "@/lib/apikey-api";

export const Route = createFileRoute("/_authenticated/profile/api-keys")({
	component: APIKeysPage,
});

function formatDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function APIKeysPage() {
	const queryClient = useQueryClient();
	const { data: keys = [], isLoading } = useQuery(apiKeysQueryOptions);

	// Create dialog state
	const [createOpen, setCreateOpen] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyExpiry, setNewKeyExpiry] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);

	// Reveal dialog state (shown once after creation)
	const [revealedKey, setRevealedKey] = useState<CreateAPIKeyResponse | null>(
		null,
	);
	const [copied, setCopied] = useState(false);

	// Revoke confirm dialog state
	const [revokeTarget, setRevokeTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);

	const createMutation = useMutation({
		mutationFn: () =>
			createAPIKey({
				name: newKeyName.trim(),
				expires_at: newKeyExpiry ? `${newKeyExpiry}T00:00:00Z` : null,
			}),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
			setCreateOpen(false);
			setNewKeyName("");
			setNewKeyExpiry("");
			setCreateError(null);
			setRevealedKey(result);
		},
		onError: (err: { response?: { data?: { error_code?: string } } }) => {
			const code = err.response?.data?.error_code;
			if (code === "API_KEY_NAME_INVALID") {
				setCreateError("Name must not be empty.");
			} else if (code === "API_KEY_NAME_TOO_LONG") {
				setCreateError("Name must be 100 characters or fewer.");
			} else {
				setCreateError("Failed to create key. Please try again.");
			}
		},
	});

	const revokeMutation = useMutation({
		mutationFn: (id: string) => revokeAPIKey(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["api-keys"] });
			setRevokeTarget(null);
		},
	});

	function handleCopy() {
		if (!revealedKey) return;
		navigator.clipboard.writeText(revealedKey.key).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	function handleCreateClose(open: boolean) {
		if (!open) {
			setNewKeyName("");
			setNewKeyExpiry("");
			setCreateError(null);
		}
		setCreateOpen(open);
	}

	return (
		<div className="max-w-3xl mx-auto flex flex-col gap-6 p-4 md:p-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
				<p className="text-sm text-muted-foreground mt-1">
					API keys let you authenticate API requests without using your session
					cookies. Treat them like passwords — never share them.
				</p>
			</div>

			<Card>
				<CardHeader className="flex flex-row items-center justify-between pb-2">
					<div>
						<CardTitle className="text-base">Your keys</CardTitle>
						<CardDescription>
							Keys are shown with only the first 8 characters for
							identification.
						</CardDescription>
					</div>
					<Button size="sm" onClick={() => setCreateOpen(true)}>
						<Plus className="size-4 mr-1.5" />
						New key
					</Button>
				</CardHeader>

				<CardContent>
					{isLoading ? (
						<p className="text-sm text-muted-foreground py-4 text-center">
							Loading…
						</p>
					) : keys.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-10 text-center">
							<Key className="size-8 text-muted-foreground/50" />
							<p className="text-sm text-muted-foreground">
								No API keys yet. Create one to get started.
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Prefix</TableHead>
									<TableHead>Created</TableHead>
									<TableHead>Expires</TableHead>
									<TableHead>Last used</TableHead>
									<TableHead className="w-10" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{keys.map((key) => (
									<TableRow key={key.id}>
										<TableCell className="font-medium">{key.name}</TableCell>
										<TableCell className="font-mono text-xs text-muted-foreground">
											paca_{key.key_prefix}…
										</TableCell>
										<TableCell>{formatDate(key.created_at)}</TableCell>
										<TableCell>{formatDate(key.expires_at)}</TableCell>
										<TableCell>{formatDate(key.last_used_at)}</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												className="size-8 text-muted-foreground hover:text-destructive"
												aria-label="Revoke key"
												onClick={() =>
													setRevokeTarget({
														id: key.id,
														name: key.name,
													})
												}
											>
												<Trash2 className="size-4" />
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{/* Create key dialog */}
			<Dialog open={createOpen} onOpenChange={handleCreateClose}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Create API key</DialogTitle>
						<DialogDescription>
							Give your key a descriptive name so you can identify it later.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="key-name">Name</Label>
							<Input
								id="key-name"
								placeholder="e.g. CI pipeline, Local dev"
								value={newKeyName}
								onChange={(e) => {
									setNewKeyName(e.target.value);
									setCreateError(null);
								}}
								autoFocus
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="key-expiry">
								Expiration date{" "}
								<span className="text-muted-foreground font-normal">
									(optional)
								</span>
							</Label>
							<Input
								id="key-expiry"
								type="date"
								value={newKeyExpiry}
								onChange={(e) => setNewKeyExpiry(e.target.value)}
							/>
						</div>

						{createError ? (
							<p className="text-sm text-destructive">{createError}</p>
						) : null}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => handleCreateClose(false)}
							disabled={createMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => createMutation.mutate()}
							disabled={createMutation.isPending || !newKeyName.trim()}
						>
							{createMutation.isPending ? "Creating…" : "Create key"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* One-time key reveal dialog */}
			<Dialog
				open={!!revealedKey}
				onOpenChange={(open) => {
					if (!open) {
						setRevealedKey(null);
						setCopied(false);
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>API key created</DialogTitle>
						<DialogDescription>
							Copy your new key now. You won't be able to see it again.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3 py-2">
						<p className="text-sm font-medium">{revealedKey?.name}</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 break-all select-all font-mono">
								{revealedKey?.key}
							</code>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0"
								onClick={handleCopy}
								aria-label="Copy key"
							>
								<Copy className="size-4" />
							</Button>
						</div>
						{copied ? (
							<p className="text-xs text-green-600">Copied to clipboard!</p>
						) : null}
					</div>

					<DialogFooter>
						<Button
							onClick={() => {
								setRevealedKey(null);
								setCopied(false);
							}}
						>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Revoke confirm dialog */}
			<Dialog
				open={!!revokeTarget}
				onOpenChange={(open) => {
					if (!open) setRevokeTarget(null);
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Revoke API key</DialogTitle>
						<DialogDescription>
							Are you sure you want to revoke{" "}
							<strong>{revokeTarget?.name}</strong>? Any requests using this key
							will stop working immediately.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRevokeTarget(null)}
							disabled={revokeMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={revokeMutation.isPending}
							onClick={() => {
								if (revokeTarget) {
									revokeMutation.mutate(revokeTarget.id);
								}
							}}
						>
							{revokeMutation.isPending ? "Revoking…" : "Revoke key"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
