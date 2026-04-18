export type HeaderBag = Record<string, string | string[] | undefined>;
type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue | undefined;
};
export type WebhookDecision = {
    outcome: "accepted";
    delivery: AcceptedWebhookDelivery;
} | {
    outcome: "ignored";
    reason: WebhookIgnoreReason;
    delivery: IgnoredWebhookDelivery;
} | {
    outcome: "rejected";
    reason: WebhookRejectReason;
    statusCode: number;
    message: string;
};
export type WebhookRejectReason = "missing_secret" | "missing_signature" | "missing_delivery_id" | "missing_event_name" | "invalid_signature_format" | "invalid_signature" | "invalid_json" | "payload_not_object";
export type WebhookIgnoreReason = "event_not_allowed" | "action_not_allowed";
export interface AcceptedWebhookDelivery {
    deliveryId: string;
    eventName: string;
    action: string | null;
    receivedAt: string;
    hookId: string | null;
    installationId: number | null;
    repositoryFullName: string | null;
    senderLogin: string | null;
    rawBodySha256: `sha256:${string}`;
    payload: JsonObject;
}
export interface IgnoredWebhookDelivery {
    deliveryId: string;
    eventName: string;
    action: string | null;
    receivedAt: string;
    hookId: string | null;
    rawBodySha256: `sha256:${string}`;
}
export type WebhookHandoffResult = {
    kind?: string;
    status?: string;
    [key: string]: unknown;
} | undefined;
export interface WebhookHandoff {
    enqueue(delivery: AcceptedWebhookDelivery): void | WebhookHandoffResult | Promise<void | WebhookHandoffResult>;
}
export interface MemoryWebhookHandoff extends WebhookHandoff {
    readonly deliveries: readonly AcceptedWebhookDelivery[];
    size(): number;
    drain(): AcceptedWebhookDelivery[];
}
export type NormalizedWebhookResult = {
    ok: true;
    status: 202;
    code: "accepted";
    delivery: AcceptedWebhookDelivery;
} | {
    ok: false;
    status: 202;
    code: WebhookIgnoreReason;
    delivery: IgnoredWebhookDelivery;
} | {
    ok: false;
    status: number;
    code: WebhookRejectReason;
    message: string;
};
export declare const GITHUB_SIGNATURE_256_HEADER = "x-hub-signature-256";
export declare const GITHUB_DELIVERY_HEADER = "x-github-delivery";
export declare const GITHUB_EVENT_HEADER = "x-github-event";
export declare const GITHUB_HOOK_ID_HEADER = "x-github-hook-id";
export declare const GITHUB_SIGNATURE_PREFIX = "sha256=";
declare const ALWAYS_ALLOWED = "*";
export declare const WEBHOOK_ACTION_ALLOWLIST: Record<string, readonly string[] | typeof ALWAYS_ALLOWED>;
export declare const WEBHOOK_EVENT_ALLOWLIST: readonly string[];
export declare function readHeader(headers: HeaderBag, name: string): string | null;
export declare function computeGitHubSignature(secret: string, rawBody: Uint8Array): string;
export declare function createGitHubWebhookSignature(secret: string, rawBody: Uint8Array): string;
export declare function sha256Hex(rawBody: Uint8Array): string;
export declare function sha256Digest(rawBody: Uint8Array): `sha256:${string}`;
export declare function verifyGitHubSignature(secret: string, rawBody: Uint8Array, receivedSignature: string): boolean;
export declare function verifyGitHubWebhookSignature(secret: string, rawBody: Uint8Array, receivedSignature: string): boolean;
export declare function isAllowedWebhookEvent(eventName: string): boolean;
export declare function isAllowedWebhookAction(eventName: string, action: string | null): boolean;
export declare function classifyGitHubWebhookDelivery(params: {
    headers: HeaderBag;
    rawBody: Uint8Array;
    secret: string;
    receivedAt?: string;
}): WebhookDecision;
export declare function verifyAndNormalizeGitHubWebhook(headers: HeaderBag, rawBody: Uint8Array, options: {
    secret: string;
    now?: () => Date;
}): NormalizedWebhookResult;
export declare function createMemoryWebhookHandoff(maxQueued?: number): MemoryWebhookHandoff;
export {};
