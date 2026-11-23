# Deploying sewrica-cafe-backend

This file explains deployment options and required secrets.

Recommended: Render (managed) or connect repository to Vercel for full-stack deploy. Alternatively, use Docker image from GitHub Container Registry.

Required secrets for full automation (GitHub repository Settings → Secrets):

- `RENDER_API_KEY` (if using Render deploy action)
- `RENDER_SERVICE_ID` (service id for your Render service)

Optional: GitHub Packages / GHCR auth is handled by the workflow using `GITHUB_TOKEN`.

Manual steps (Render):
1. Create a Render Web Service, connect your GitHub repo.
2. Create a MySQL database and set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
   `MYSQL_PASSWORD`, and `MYSQL_DATABASE` together with `JWT_SECRET` and
   `NODE_ENV=production` in the Render dashboard.
3. Deploy.

The backend stores its existing document-shaped records in MySQL's JSON column
so the API and business rules remain unchanged. The application creates its
`app_documents` table at startup. To copy existing records, set `MONGODB_URI`
temporarily and run `npm run migrate:mongodb`; the importer reads from MongoDB
and does not delete or modify source records.
