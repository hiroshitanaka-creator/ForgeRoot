{
  "name": "@forgeroot/github-app",
  "version": "0.0.0-t007",
  "private": true,
  "type": "module",
  "description": "ForgeRoot GitHub App webhook ingest surface.",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && node --test --test-force-exit tests/*.test.mjs",
    "start": "node dist/server.js"
  },
  "engines": {
    "node": ">=20.11"
  },
  "devDependencies": {
    "@types/node": "^22.19.17",
    "typescript": "^5.8.3"
  }
}
