import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "./api-client";
import type { SuccessEnvelope } from "./api-error";

export interface APIKey {
	id: string;
	name: string;
	key_prefix: string;
	last_used_at: string | null;
	expires_at: string | null;
	created_at: string;
}

export interface CreateAPIKeyRequest {
	name: string;
	expires_at?: string | null;
}

export interface CreateAPIKeyResponse extends APIKey {
	/** Raw key — shown ONCE immediately after creation */
	key: string;
}

export async function listAPIKeys(): Promise<APIKey[]> {
	const { data } =
		await apiClient.instance.get<SuccessEnvelope<APIKey[]>>(
			"/users/me/api-keys",
		);
	return data.data;
}

export async function createAPIKey(
	payload: CreateAPIKeyRequest,
): Promise<CreateAPIKeyResponse> {
	const { data } = await apiClient.instance.post<
		SuccessEnvelope<CreateAPIKeyResponse>
	>("/users/me/api-keys", payload);
	return data.data;
}

export async function revokeAPIKey(id: string): Promise<void> {
	await apiClient.instance.delete(`/users/me/api-keys/${id}`);
}

export const apiKeysQueryOptions = queryOptions({
	queryKey: ["api-keys"],
	queryFn: listAPIKeys,
});
