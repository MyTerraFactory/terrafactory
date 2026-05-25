# Deployment Guide

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/terrafactory
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-me
GITHUB_CLIENT_ID=replace-me
GITHUB_CLIENT_SECRET=replace-me
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
REDIS_URL=redis://localhost:6379
```

## Database

```bash
npx prisma migrate dev
npx prisma generate
```

## Docker

```bash
docker compose up --build
```

## Azure App Service With Docker Hub

Recommended MVP setup:

- Publish mode: Container
- OS: Linux
- App Service Plan: Basic B1 or higher for custom containers
- Registry: Docker Hub
- Container port: 3000
- Database: Neon Postgres

Build and test locally:

```bash
docker build -t terrafactory .
docker run --rm -p 3000:3000 terrafactory
```

Push to Docker Hub:

```bash
docker login
docker tag terrafactory <dockerhub-user>/terrafactory:latest
docker push <dockerhub-user>/terrafactory:latest
```

Create the Azure Web App for Containers:

```bash
az group create \
  --name rg-terrafactory-prod \
  --location eastus

az appservice plan create \
  --name asp-terrafactory-prod \
  --resource-group rg-terrafactory-prod \
  --is-linux \
  --sku B1

az webapp create \
  --name terrafactory-prod \
  --resource-group rg-terrafactory-prod \
  --plan asp-terrafactory-prod \
  --deployment-container-image-name <dockerhub-user>/terrafactory:latest
```

Configure the container and environment variables:

```bash
az webapp config container set \
  --name terrafactory-prod \
  --resource-group rg-terrafactory-prod \
  --docker-custom-image-name <dockerhub-user>/terrafactory:latest \
  --docker-registry-server-url https://index.docker.io

az webapp config appsettings set \
  --name terrafactory-prod \
  --resource-group rg-terrafactory-prod \
  --settings \
  WEBSITES_PORT=3000 \
  NODE_ENV=production \
  DATABASE_URL="<neon-pooled-connection-string>" \
  DIRECT_URL="<neon-direct-connection-string>" \
  NEXTAUTH_URL="https://terrafactory-prod.azurewebsites.net" \
  NEXTAUTH_SECRET="<long-random-secret>"
```

Restart and check logs:

```bash
az webapp restart \
  --name terrafactory-prod \
  --resource-group rg-terrafactory-prod

az webapp log tail \
  --name terrafactory-prod \
  --resource-group rg-terrafactory-prod
```

For private Docker Hub repositories, also set Docker registry username and password in the container configuration. Public repositories do not need registry credentials, but Docker Hub rate limits can still apply.

## Recommended Cloud Launch

For the MVP, deploy the Next.js app on Vercel and keep managed data services separate:

- Web app: Vercel, using the included `vercel.json`.
- PostgreSQL: Neon, Supabase, Vercel Postgres, or a cloud-managed PostgreSQL instance.
- Redis: Upstash Redis or a managed Redis instance.
- Object exports: add S3, Azure Blob Storage, or GCS when project ZIP history moves server-side.

This keeps the app fast to ship while preserving a clean migration path to AWS App Runner, Azure Container Apps, Google Cloud Run, or Kubernetes later.

### Vercel CLI

```bash
npm ci
npm run build
npx vercel
npx vercel --prod
```

Set these environment variables in the Vercel project before enabling accounts, persistence, OAuth, or AI features:

```bash
DATABASE_URL=replace-me
REDIS_URL=replace-me
NEXTAUTH_URL=https://your-domain.example
NEXTAUTH_SECRET=replace-me
GITHUB_CLIENT_ID=replace-me
GITHUB_CLIENT_SECRET=replace-me
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
OPENAI_API_KEY=replace-me
```

### Container Clouds

Use the Dockerfile for AWS App Runner, Azure Container Apps, Google Cloud Run, Fly.io, or Render:

```bash
docker build -t terrafactory .
docker run -p 3000:3000 terrafactory
```

## Domain Recommendation

Avoid `terrafactory.*` as the primary brand unless the naming conflict is acceptable. Search results already show unrelated TerraFactory games, which can make SEO and brand recall harder.

Recommended launch domain:

```text
stackfabric.dev
```

Strong alternatives:

```text
cloudcomposer.dev
terrafabric.dev
terraformstudio.dev
tryterrafactory.com
```

Before purchase, confirm registrar availability and run a trademark check in the target markets.

## CI/CD

The GitHub Actions workflow runs install, typecheck, lint, Prisma generation, and Next.js build. Production deployments should add image publishing, vulnerability scanning, and environment-specific promotion.
