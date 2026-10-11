# A Team Orbit

A tracker for a supervisor and up to five direct reports.

- Tasks for each person: tech stack, status, progress, issues and obstacles
- Color-coded progress bars (red at risk, amber underway, blue on track, green done)
- Weekly 30-minute 1:1 schedule, meeting logs and supervisor notes
- Annual review form with 1–5 ratings, goals and comments

## Links

| What | URL |
|------|-----|
| Live demo (classic single-file version, saves in your browser) | https://gluay88.github.io/a-team-orbit/ |
| React app, local development | http://localhost:5173 (see [Run locally](#run-locally)) |
| React app, production | Coming soon on CloudFront, after AWS account verification |
| Source code | https://github.com/Gluay88/a-team-orbit |

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, Vite 5 |
| API      | Node.js 20 on AWS Lambda, behind API Gateway (HTTP API) |
| Database | Amazon DynamoDB (on-demand, point-in-time recovery on) |
| Hosting  | Amazon S3 + CloudFront |
| Infra    | Serverless Framework v3 (`backend/serverless.yml`) |

```
frontend/   React app (src/App.jsx, forms.jsx, ui.jsx, lib.js, api.js)
backend/    Lambda handler, infrastructure, example-data seed script
deploy.sh   Deploys the backend, builds the React app, uploads it to S3
```

## Deploy

Requires Node.js 18+, the AWS CLI logged in, and Serverless Framework v3.

```bash
./deploy.sh            # prints the API and site URLs when done
node backend/seed.mjs <API_URL>   # optional: load the example team
```

## Run locally

```bash
cd frontend
npm install
VITE_API_URL=<API_URL> npm run dev
```

## API

| Method | Path                     | Does |
|--------|--------------------------|------|
| GET    | `/data`                  | Returns all members, tasks, meetings, reviews and team settings |
| PUT    | `/{collection}/{id}`     | Creates or replaces one item (`members`, `tasks`, `meetings`, `reviews`, `settings`) |
| DELETE | `/{collection}/{id}`     | Deletes one item. Deleting a member also deletes their tasks, 1:1s and reviews |

**Security note:** the API has no login. Anyone with the URL can read and change the data.
Add authentication (for example Amazon Cognito) before storing real reviews or personal notes.

## Remove everything from AWS

```bash
aws s3 rm s3://<SiteBucketName> --recursive
cd backend && serverless remove --stage prod
```
