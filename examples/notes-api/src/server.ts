import { buildNotesApp } from "./app.js";

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "127.0.0.1";

const app = buildNotesApp({ port, host });

console.log(`Starting Notes API on http://${host}:${port}`);
console.log(`OpenAPI Documentation: http://${host}:${port}/docs`);

await app.http.listen();
