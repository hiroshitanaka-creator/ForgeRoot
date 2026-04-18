// Minimal Node.js declarations used by the T007 TypeScript sources.
// Replace with @types/node once the repository package manager is bootstrapped.

type BufferEncoding = "utf8" | "hex" | "base64" | "latin1" | "ascii" | string;

declare class Buffer extends Uint8Array {
  static from(input: string | ArrayBuffer | ArrayBufferView | readonly number[], encoding?: BufferEncoding): Buffer;
  static concat(chunks: readonly Uint8Array[], totalLength?: number): Buffer;
  static byteLength(input: string, encoding?: BufferEncoding): number;
  readonly length: number;
  readonly byteLength: number;
  toString(encoding?: BufferEncoding): string;
}

declare module "node:buffer" {
  export { Buffer };
}

declare module "node:crypto" {
  export interface Hmac {
    update(data: string | Uint8Array): Hmac;
    digest(encoding: "hex"): string;
  }
  export interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHmac(algorithm: string, key: string | Uint8Array): Hmac;
  export function createHash(algorithm: string): Hash;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

declare module "node:http" {
  export interface IncomingHttpHeaders {
    [header: string]: string | string[] | undefined;
  }
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: IncomingHttpHeaders;
    on(event: "data", listener: (chunk: Uint8Array | string) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    destroy(error?: Error): void;
  }
  export interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): this;
    end(chunk?: string): void;
  }
  export interface Server {
    listen(port: number, host?: string, callback?: () => void): this;
    close(callback?: (error?: Error) => void): void;
    address(): { port: number; address: string; family: string } | string | null;
  }
  export function createServer(requestListener?: (request: IncomingMessage, response: ServerResponse) => void): Server;
}

declare module "node:process" {
  const process: {
    env: Record<string, string | undefined>;
    argv: string[];
    exitCode?: number;
  };
  export default process;
}

declare const console: {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};
