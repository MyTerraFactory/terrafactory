# TerraFactory

Visual Terraform Infrastructure Composer for production-oriented cloud stacks.

## Local Development

```bash
npm ci
npx prisma generate
npm run dev
```

Open `http://localhost:3000`.

## Docker

```bash
docker build -t pinakispecial/terrafactory:latest .
docker run --rm -p 3000:3000 pinakispecial/terrafactory:latest
```

## GitHub Actions

The workflow in `.github/workflows/ci.yml` runs typecheck, lint, build, and then pushes Docker images on `main` or manual dispatch.

Create these GitHub repository secrets:

```text
DOCKERHUB_USERNAME=pinakispecial
DOCKERHUB_TOKEN=<docker-hub-access-token>
```

Images pushed:

```text
pinakispecial/terrafactory:latest
pinakispecial/terrafactory:<git-sha>
```

## Azure App Service Container Settings

Use Docker Hub image:

```text
pinakispecial/terrafactory:latest
```

Required app settings:

```text
WEBSITES_PORT=3000
PORT=3000
HOSTNAME=0.0.0.0
WEBSITES_ENABLE_APP_SERVICE_STORAGE=false
NODE_ENV=production
NEXTAUTH_URL=https://terrafactory-prod.azurewebsites.net
NEXTAUTH_SECRET=<long-random-secret>
DATABASE_URL=<neon-pooled-url>
DIRECT_URL=<neon-direct-url>
```

Optional settings are listed in `.env.example`.
