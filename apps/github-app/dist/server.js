import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import process from "node:process";
import { createEventInboxHandoff, isEventInboxEnqueueResult, openSqliteEventInbox, } from "./event-inbox.js";
import { classifyGitHubWebhookDelivery, } from "./webhooks.js";
const DEFAULT_PORT = 8080;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_MAX_BODY_BYTES = 26 * 1024 * 1024;
const DEFAULT_EVENT_INBOX_SQLITE_PATH = "var/forgeroot/event-inbox.sqlite3";
const WEBHOOK_PATHS = new Set(["/api/github/webhook", "/webhooks/github"]);
export class HttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}
export function createGitHubWebhookServer(options) {
    if (options.webhookSecret.length === 0) {
        throw new Error("FORGE_WEBHOOK_SECRET is required to start the webhook server.");
    }
    return createServer((request, response) => {
        void routeRequest(request, response, options).catch((error) => {
            const statusCode = error instanceof HttpError ? error.statusCode : 500;
            const message = error instanceof Error ? error.message : "Unhandled webhook server error.";
            sendJson(response, statusCode, {
                ok: false,
                error: statusCode === 500 ? "internal_error" : "request_error",
                message,
            });
        });
    });
}
export async function routeRequest(request, response, options) {
    const pathname = pathOnly(request.url ?? "/");
    if (request.method === "GET" && pathname === "/healthz") {
        sendJson(response, 200, { ok: true, service: "forgeroot-github-app" });
        return;
    }
    if (!WEBHOOK_PATHS.has(pathname)) {
        sendJson(response, 404, { ok: false, error: "not_found" });
        return;
    }
    if (request.method !== "POST") {
        sendJson(response, 405, { ok: false, error: "method_not_allowed" });
        return;
    }
    const rawBody = await readRawBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
    const decision = classifyGitHubWebhookDelivery({
        headers: request.headers,
        rawBody,
        secret: options.webhookSecret,
    });
    await respondToWebhookDecision(response, decision, options);
}
export async function respondToWebhookDecision(response, decision, options) {
    if (decision.outcome === "rejected") {
        sendJson(response, decision.statusCode, {
            ok: false,
            rejected: true,
            reason: decision.reason,
            message: decision.message,
        });
        return;
    }
    if (decision.outcome === "ignored") {
        sendJson(response, 202, {
            ok: true,
            ignored: true,
            reason: decision.reason,
            delivery_id: decision.delivery.deliveryId,
            event: decision.delivery.eventName,
            action: decision.delivery.action,
        });
        return;
    }
    const delivery = decision.delivery;
    let handoffResult;
    try {
        handoffResult = await options.handoff.enqueue(delivery);
    }
    catch (error) {
        if (options.onAsyncHandoffError !== undefined) {
            options.onAsyncHandoffError(error, delivery);
        }
        console.error("ForgeRoot webhook inbox enqueue failed", {
            deliveryId: delivery.deliveryId,
            eventName: delivery.eventName,
            error,
        });
        throw new HttpError(503, "Webhook delivery could not be persisted to the event inbox.");
    }
    const inboxResult = isEventInboxEnqueueResult(handoffResult) ? handoffResult : null;
    if (inboxResult?.kind === "conflict") {
        sendJson(response, 409, {
            ok: false,
            accepted: false,
            error: "delivery_id_hash_conflict",
            delivery_id: delivery.deliveryId,
            event: delivery.eventName,
            action: delivery.action,
            inbox: summarizeInboxResult(inboxResult),
        });
        return;
    }
    sendJson(response, 202, {
        ok: true,
        accepted: true,
        duplicate: inboxResult?.kind === "duplicate",
        delivery_id: delivery.deliveryId,
        event: delivery.eventName,
        action: delivery.action,
        ...(inboxResult === null ? {} : { inbox: summarizeInboxResult(inboxResult) }),
    });
}
export function readRawBody(request, maxBodyBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalBytes = 0;
        let rejected = false;
        request.on("data", (chunk) => {
            if (rejected) {
                return;
            }
            const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
            totalBytes += buffer.length;
            if (totalBytes > maxBodyBytes) {
                rejected = true;
                reject(new HttpError(413, "Webhook payload exceeds maximum accepted size."));
                request.destroy();
                return;
            }
            chunks.push(buffer);
        });
        request.on("end", () => {
            if (!rejected) {
                resolve(Buffer.concat(chunks, totalBytes));
            }
        });
        request.on("error", (error) => {
            if (!rejected) {
                reject(error);
            }
        });
    });
}
function summarizeInboxResult(result) {
    return {
        kind: result.kind,
        delivery_id: result.record.deliveryId,
        status: result.record.status,
        attempts: result.record.attempts,
        duplicate_count: result.record.duplicateCount,
        ...(result.kind === "conflict" ? { reason: result.reason } : {}),
    };
}
function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
    });
    response.end(`${JSON.stringify(body)}\n`);
}
function pathOnly(url) {
    const queryIndex = url.indexOf("?");
    return queryIndex >= 0 ? url.slice(0, queryIndex) : url;
}
export function createLoggingHandoff() {
    return {
        enqueue(delivery) {
            console.log("ForgeRoot webhook accepted", {
                deliveryId: delivery.deliveryId,
                eventName: delivery.eventName,
                action: delivery.action,
                repositoryFullName: delivery.repositoryFullName,
                rawBodySha256: delivery.rawBodySha256,
            });
        },
    };
}
export function startFromEnvironment() {
    const webhookSecret = process.env.FORGE_WEBHOOK_SECRET ?? "";
    const host = process.env.FORGE_GITHUB_APP_HOST ?? DEFAULT_HOST;
    const port = Number.parseInt(process.env.FORGE_GITHUB_APP_PORT ?? `${DEFAULT_PORT}`, 10);
    const inboxPath = process.env.FORGE_EVENT_INBOX_SQLITE_PATH ?? DEFAULT_EVENT_INBOX_SQLITE_PATH;
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
        throw new Error("FORGE_GITHUB_APP_PORT must be a valid TCP port.");
    }
    const inbox = openSqliteEventInbox(inboxPath);
    const server = createGitHubWebhookServer({
        webhookSecret,
        handoff: createEventInboxHandoff(inbox),
    });
    server.listen(port, host, () => {
        console.log(`ForgeRoot GitHub App webhook server listening on ${host}:${port}`);
        console.log(`ForgeRoot event inbox SQLite path: ${inboxPath}`);
    });
    return server;
}
if (process.argv[1]?.endsWith("server.js") === true) {
    try {
        startFromEnvironment();
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
//# sourceMappingURL=server.js.map