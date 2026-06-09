import { env } from "./config/env.js"
import { buildApp } from "./app.js"

const app = await buildApp()

await app.listen({ port: env.BACKEND_PORT, host: env.BACKEND_HOST })
