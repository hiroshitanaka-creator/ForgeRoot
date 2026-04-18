import { Buffer } from "node:buffer";
import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type RuntimeModeController } from "./runtime-mode.js";
import { type AcceptedWebhookDelivery, type WebhookDecision, type WebhookHandoff } from "./webhooks.js";
export interface GitHubWebhookServerOptions {
    webhookSecret: string;
    handoff: WebhookHandoff;
    maxBodyBytes?: number;
    onAsyncHandoffError?: (error: unknown, delivery: AcceptedWebhookDelivery) => void;
    runtimeController?: RuntimeModeController;
    adminToken?: string;
}
export declare class HttpError extends Error {
    readonly statusCode: number;
    constructor(statusCode: number, message: string);
}
export declare function createGitHubWebhookServer(options: GitHubWebhookServerOptions): Server;
export declare function routeRequest(request: IncomingMessage, response: ServerResponse, options: GitHubWebhookServerOptions): Promise<void>;
export declare function respondToWebhookDecision(response: ServerResponse, decision: WebhookDecision, options: GitHubWebhookServerOptions): Promise<void>;
export declare function readRawBody(request: IncomingMessage, maxBodyBytes: number): Promise<Buffer>;
export declare function createLoggingHandoff(): WebhookHandoff;
export declare function startFromEnvironment(): Server;
