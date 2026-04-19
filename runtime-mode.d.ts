import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const GITHUB_SIGNATURE_256_HEADER = "x-hub-signature-256";
export const GITHUB_DELIVERY_HEADER = "x-github-delivery";
export const GITHUB_EVENT_HEADER = "x-github-event";
export const GITHUB_HOOK_ID_HEADER = "x-github-hook-id";
export const GITHUB_SIGNATURE_PREFIX = "sha256=";
const HEX_SHA256_RE = /^sha256=[0-9a-f]{64}$/;
const ALWAYS_ALLOWED = "*";
export const WEBHOOK_ACTION_ALLOWLIST = {
    installation: ALWAYS_ALLOWED,
    installation_repositories: ["added", "removed"],
    issues: ["opened", "edited", "labeled", "unlabeled", "reopened", "closed"],
    issue_comment: ["created", "edited"],
    pull_request: ["opened", "edited", "synchronize", "reopened", "closed", "ready_for_review"],
    pull_request_review: ["submitted", "edited", "dismissed"],
    push: ALWAYS_ALLOWED,
    check_suite: ["completed", "requested", "rerequested"],
    check_run: ["completed", "rerequested", "requested_action"],
    workflow_run: ["completed", "requested", "in_progress"],
    fork: ALWAYS_ALLOWED,
};
export const WEBHOOK_EVENT_ALLOWLIST = Object.freeze(Object.keys(WEBHOOK_ACTION_ALLOWLIST));
export function readHeader(headers, name) {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== wanted) {
            continue;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") {
            const trimmed = value[0].trim();
            return trimmed.length > 0 ? trimmed : null;
        }
        return null;
    }
    return null;
}
export function computeGitHubSignature(secret, rawBody) {
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
    return `${GITHUB_SIGNATURE_PREFIX}${digest}`;
}
export function createGitHubWebhookSignature(secret, rawBody) {
    return computeGitHubSignature(secret, rawBody);
}
export function sha256Hex(rawBody) {
    return createHash("sha256").update(rawBody).digest("hex");
}
export function sha256Digest(rawBody) {
    return `sha256:${sha256Hex(rawBody)}`;
}
export function verifyGitHubSignature(secret, rawBody, receivedSignature) {
    if (secret.length === 0 || !HEX_SHA256_RE.test(receivedSignature)) {
        return false;
    }
    const expectedSignature = computeGitHubSignature(secret, rawBody);
    const expectedBytes = Buffer.from(expectedSignature, "utf8");
    const receivedBytes = Buffer.from(receivedSignature, "utf8");
    if (expectedBytes.length !== receivedBytes.length) {
        return false;
    }
    return timingSafeEqual(expectedBytes, receivedBytes);
}
export function verifyGitHubWebhookSignature(secret, rawBody, receivedSignature) {
    return verifyGitHubSignature(secret, rawBody, receivedSignature);
}
export function isAllowedWebhookEvent(eventName) {
    return Object.prototype.hasOwnProperty.call(WEBHOOK_ACTION_ALLOWLIST, eventName);
}
export function isAllowedWebhookAction(eventName, action) {
    const allowed = WEBHOOK_ACTION_ALLOWLIST[eventName];
    if (allowed === undefined) {
        return false;
    }
    if (allowed === ALWAYS_ALLOWED) {
        return true;
    }
    if (action === null) {
        return false;
    }
    return allowed.includes(action);
}
export function classifyGitHubWebhookDelivery(params) {
    const secret = params.secret;
    if (secret.length === 0) {
        return reject("missing_secret", 500, "Webhook secret is not configured.");
    }
    const receivedAt = params.receivedAt ?? new Date().toISOString();
    const signature = readHeader(params.headers, GITHUB_SIGNATURE_256_HEADER);
    const deliveryId = readHeader(params.headers, GITHUB_DELIVERY_HEADER);
    const eventName = readHeader(params.headers, GITHUB_EVENT_HEADER);
    const hookId = readHeader(params.headers, GITHUB_HOOK_ID_HEADER);
    if (signature === null) {
        return reject("missing_signature", 401, "Missing X-Hub-Signature-256 header.");
    }
    if (!HEX_SHA256_RE.test(signature)) {
        return reject("invalid_signature_format", 401, "Invalid X-Hub-Signature-256 format.");
    }
    if (!verifyGitHubSignature(secret, params.rawBody, signature)) {
        return reject("invalid_signature", 401, "Invalid webhook signature.");
    }
    if (deliveryId === null) {
        return reject("missing_delivery_id", 400, "Missing X-GitHub-Delivery header.");
    }
    if (eventName === null) {
        return reject("missing_event_name", 400, "Missing X-GitHub-Event header.");
    }
    if (!isAllowedWebhookEvent(eventName)) {
        return {
            outcome: "ignored",
            reason: "event_not_allowed",
            delivery: {
                deliveryId,
                eventName,
                action: null,
                receivedAt,
                hookId,
                rawBodySha256: sha256Digest(params.rawBody),
            },
        };
    }
    const parsedPayload = parseJsonObject(params.rawBody);
    if (parsedPayload.kind === "invalid_json") {
        return reject("invalid_json", 400, "Webhook payload is not valid JSON.");
    }
    if (parsedPayload.kind === "not_object") {
        return reject("payload_not_object", 400, "Webhook payload must be a JSON object.");
    }
    const payload = parsedPayload.value;
    const action = readStringField(payload, "action");
    if (!isAllowedWebhookAction(eventName, action)) {
        return {
            outcome: "ignored",
            reason: "action_not_allowed",
            delivery: {
                deliveryId,
                eventName,
                action,
                receivedAt,
                hookId,
                rawBodySha256: sha256Digest(params.rawBody),
            },
        };
    }
    return {
        outcome: "accepted",
        delivery: {
            deliveryId,
            eventName,
            action,
            receivedAt,
            hookId,
            installationId: readNestedNumber(payload, ["installation", "id"]),
            repositoryFullName: readNestedString(payload, ["repository", "full_name"]),
            senderLogin: readNestedString(payload, ["sender", "login"]),
            rawBodySha256: sha256Digest(params.rawBody),
            payload,
        },
    };
}
export function verifyAndNormalizeGitHubWebhook(headers, rawBody, options) {
    const receivedAt = options.now?.().toISOString();
    const decision = classifyGitHubWebhookDelivery({
        headers,
        rawBody,
        secret: options.secret,
        ...(receivedAt === undefined ? {} : { receivedAt }),
    });
    if (decision.outcome === "accepted") {
        return { ok: true, status: 202, code: "accepted", delivery: decision.delivery };
    }
    if (decision.outcome === "ignored") {
        return { ok: false, status: 202, code: decision.reason, delivery: decision.delivery };
    }
    return {
        ok: false,
        status: decision.statusCode,
        code: decision.reason,
        message: decision.message,
    };
}
export function createMemoryWebhookHandoff(maxQueued = 128) {
    const deliveries = [];
    return {
        get deliveries() {
            return deliveries;
        },
        enqueue(delivery) {
            deliveries.push(delivery);
            if (deliveries.length > maxQueued) {
                deliveries.shift();
            }
        },
        size() {
            return deliveries.length;
        },
        drain() {
            return deliveries.splice(0, deliveries.length);
        },
    };
}
function reject(reason, statusCode, message) {
    return { outcome: "rejected", reason, statusCode, message };
}
function parseJsonObject(rawBody) {
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(rawBody).toString("utf8"));
    }
    catch {
        return { kind: "invalid_json" };
    }
    if (!isJsonObject(parsed)) {
        return { kind: "not_object" };
    }
    return { kind: "ok", value: parsed };
}
function isJsonObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readStringField(object, key) {
    const value = object[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}
function readNestedString(object, path) {
    const value = readNestedValue(object, path);
    return typeof value === "string" && value.length > 0 ? value : null;
}
function readNestedNumber(object, path) {
    const value = readNestedValue(object, path);
    return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}
function readNestedValue(object, path) {
    let cursor = object;
    for (const segment of path) {
        if (!isJsonObject(cursor)) {
            return undefined;
        }
        cursor = cursor[segment];
    }
    return cursor;
}
//# sourceMappingURL=webhooks.js.map