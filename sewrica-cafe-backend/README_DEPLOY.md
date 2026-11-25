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

Creating the first Railway admin:
1. Generate a random 32-byte token, for example with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set it as `ADMIN_BOOTSTRAP_TOKEN` on the Railway backend service and deploy.
3. Send a `POST` to `/api/setup/bootstrap-admin` with the
   `x-admin-bootstrap-token` header and a JSON body containing `name`, `email`,
   `phone`, and a unique password of at least 12 characters. Do not send this
   request from the frontend or share the token/password.
4. The endpoint only creates an admin if no admin exists. After a successful
   response, remove `ADMIN_BOOTSTRAP_TOKEN` from Railway and redeploy.

Legacy `/api/setup` routes are disabled in production. Public registration at
`/api/auth/register` creates customer accounts only; it cannot grant admin access.

The backend stores its existing document-shaped records in MySQL's JSON column
so the API and business rules remain unchanged. The application creates its
`app_documents` table at startup. To copy existing records, set `MONGODB_URI`
temporarily and run `npm run migrate:mongodb`; the importer reads from MongoDB
and does not delete or modify source records.
