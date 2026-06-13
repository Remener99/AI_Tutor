# Cloud.ru Migration Runbook

This project is ready to move from Yandex Cloud to Cloud.ru Evolution.

## Target Services

- Cloud.ru Artifact Registry: Docker image storage.
- Cloud.ru Container Apps: backend container runtime.
- Cloud.ru Managed PostgreSQL: external quota storage.
- Cloud.ru Secret Management: `OPENAI_API_KEY`, `DATABASE_URL`, admin token if needed.

References:

- Cloud.ru Container Apps runs container applications from Docker images without managing Kubernetes or VMs: https://cloud.ru/docs/container-apps-evolution/ug/index?source-platform=Evolution
- Cloud.ru backend container guide uses Artifact Registry and Container Apps, then verifies the public URL: https://cloud.ru/docs/tutorials-evolution/list/topics/container-apps__deploy-backend-app?source-platform=Evolution
- Cloud.ru Artifact Registry stores Docker images and other OCI artifacts: https://cloud.ru/docs/artifact-registry-evolution/ug/index?source-platform=Evolution
- Cloud.ru Managed PostgreSQL provides managed PostgreSQL clusters: https://cloud.ru/docs/paas-postgresql/ug/index?source-platform=Evolution
- Cloud.ru Secret Management stores API keys, passwords and other confidential values: https://cloud.ru/docs/scsm/ug/index?source-platform=Evolution

## Local Artifacts

- Backend Dockerfile: `apps/backend/Dockerfile`
- Cloud.ru env template: `.env.cloudru.example`
- Current extension package output: `apps/extension/build/chrome-mv3-prod.zip`
- Local secret backups before Yandex Cloud cleanup:
  - `.local-secrets/openai-api-key.txt`
  - `.local-secrets/current-api-token.txt`
  - `.local-secrets/admin-api-token.txt`
  - `.local-secrets/current-access-token-sha256.txt`

Do not commit `.local-secrets`.

## Backend Build

Build the backend image for Cloud.ru Artifact Registry:

```powershell
docker build --platform linux/amd64 -f apps/backend/Dockerfile -t <registry_name>.cr.cloud.ru/sempayce-ai-backend:v0.1.17 .
docker push <registry_name>.cr.cloud.ru/sempayce-ai-backend:v0.1.17
```

Cloud.ru documentation requires linux/amd64 for Container Apps images.

## Container App Settings

Use:

- Container port: `8787`
- Public address: enabled
- Min instances: `0` for low cost during pilot
- Max instances: `1` for cost control during pilot
- CPU/RAM: start with the minimal configuration that supports Node.js and AI request timeouts
- Env vars: from `.env.cloudru.example`
- Secrets:
  - `OPENAI_API_KEY`
  - `DATABASE_URL`

## PostgreSQL

Create a Cloud.ru Managed PostgreSQL cluster and database. Then set:

```text
AI_QUOTA_STORAGE=postgres
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
DATABASE_SSL=true
```

The backend creates its quota table on startup.

## Extension Rebuild

After Container Apps gives a public URL, rebuild the extension:

```powershell
$env:PLASMO_PUBLIC_API_BASE = "https://<your-container-app>.containerapps.ru"
$env:PLASMO_PUBLIC_API_TOKEN = "<pilot-api-token>"
pnpm.cmd --filter @ai-tutor/extension build
pnpm.cmd --filter @ai-tutor/extension package
```

The manifest is prepared for Cloud.ru Container Apps host permissions:

```json
"host_permissions": [
  "https://*.synergy.ru/*",
  "https://*.containerapps.ru/*"
]
```

## Verification

After deploy:

```powershell
Invoke-RestMethod https://<your-container-app>.containerapps.ru/health
Invoke-RestMethod https://<your-container-app>.containerapps.ru/admin/monitoring/status -Headers @{ "x-ai-tutor-admin-token" = "<admin-token>" }
Invoke-RestMethod https://<your-container-app>.containerapps.ru/admin/monitoring/ai-check -Headers @{ "x-ai-tutor-admin-token" = "<admin-token>" }
```

Expected:

- `/health`: `ok=true`
- `quotaStore.ok=true`
- `quotaStore.kind=postgres`
- `ai-check.ok=true`
- provider/model present

## Yandex Cloud Cleanup

Resources found before cleanup:

- Serverless Container: `ai-tutor-backend` (`bba9tns6u21vsn66e7fq`)
- Container Registry: `ai-tutor-registry` (`crp1hte93mmmdmipaukj`)
- Managed PostgreSQL: `ai-tutor-postgres` (`c9qmab586u38vajb8idj`)
- Object Storage bucket: `sempace-ai-landing-b1g4ksjjb2l50saja942`
- Lockbox secrets:
  - `ai-tutor-database-url`
  - `ai-tutor-openai`
  - `connection-a5953v3jqgrnv8p9att4`
- Service account: `ai-tutor-runtime`
- VPC: `default`

Delete order:

1. Serverless Container.
2. Managed PostgreSQL cluster.
3. Container Registry.
4. Object Storage bucket.
5. Lockbox secrets.
6. Service account.
7. VPC subnets and default network, if no longer needed.
