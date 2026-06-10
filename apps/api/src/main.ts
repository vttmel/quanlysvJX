import { buildApp } from './app.js';

const app = await buildApp();
const host = process.env.MANAGER_API_HOST ?? '127.0.0.1';
const port = Number(process.env.MANAGER_API_PORT ?? '3001');

await app.listen({ host, port });
