# Backend

Node.js + Express + PostgreSQL API using Drizzle ORM, organized in a modular folder structure.

## Getting started

```bash
npm install
```

Set your database connection string in `.env` → `DATABASE_URL`, then:

```bash
npm run dev        # start in dev mode (nodemon)
npm start          # start in production mode
```

## Database (Drizzle)

```bash
npm run db:generate   # generate migrations from schema
npm run db:migrate    # apply migrations
npm run db:push       # push schema directly (no migration files)
npm run db:studio     # browse data in Drizzle Studio
```

## Testing Locally

Run the automated test suites:

```bash
npm test                 # run all test suites (webhooks + REST API)
npm run test:api         # test REST API filters, pagination, validation
npm run test:webhook     # test webhook signature, ping, deduplication, normalization
```

You can also send custom signed sample events:

```bash
npm run webhook:send -- --event=ping           # Test ping handshake
npm run webhook:send -- --event=push --duplicate # Test push & duplicate delivery
npm run webhook:send -- --invalid-sig           # Test 401 rejection on bad signature
npm run webhook:send -- --event=issues          # Test issues event
```

---

## Connecting Real GitHub (Feature 3)

Follow these steps to connect a real GitHub repository to your local server.

> **Rule**: Always use a dedicated test repository first, not a production repository.

### Step 1: Start your backend server
Make sure your backend server is running locally:
```bash
npm run dev
```
*(Server listens on `http://localhost:3000`)*

### Step 2: Expose your local server with a tunnel tool
Choose either **smee.io** (recommended) or **ngrok**:

#### Option A: Using smee.io (Recommended)
1. Go to [https://smee.io](https://smee.io) and click **"Start a new channel"**.
2. Copy your Smee channel URL (e.g., `https://smee.io/abcXYZ123`).
3. In a new terminal window, forward Smee events to your local server:
   ```bash
   npx smee-client -u https://smee.io/abcXYZ123 -t http://localhost:3000/webhooks/github
   ```

#### Option B: Using ngrok
1. Run ngrok in a separate terminal:
   ```bash
   ngrok http 3000
   ```
2. Copy the public forwarding HTTPS URL (e.g., `https://xxxx-xx-xx.ngrok-free.app`).
3. Your Payload URL will be: `https://xxxx-xx-xx.ngrok-free.app/webhooks/github`.

---

### Step 3: Add the Webhook in your GitHub Repository
1. In your GitHub test repository, go to **Settings** → **Webhooks** (left sidebar).
2. Click **Add webhook** (GitHub may ask you to confirm your password or 2FA).
3. Configure the fields:
   - **Payload URL**:
     - If using Smee: paste your Smee channel URL (`https://smee.io/abcXYZ123`).
     - If using ngrok: paste `https://<your-ngrok-domain>/webhooks/github`.
   - **Content type**: Select `application/json`.
   - **Secret**: Paste the `WEBHOOK_SECRET` string from your `.env` file.
   - **SSL verification**: Leave enabled.
   - **Which events would you like to trigger this webhook?**: Select **"Send me everything"**.
   - **Active**: Ensure checked.
4. Click **Add webhook**.

---

### Step 4: Verify the Ping Handshake (FR-3.3, FR-3.5)
1. Immediately upon creation, GitHub sends a `ping` test delivery.
2. Under your webhook's **Recent Deliveries** tab:
   - Look for the `ping` entry.
   - You should see a green checkmark `✔ 200 OK`.
   - The response body will be `{"message":"Ping acknowledged", ...}`.

---

### Step 5: Test Real Events
Perform any of the following in your test repository:
- **Push a commit**: Push any change to your repo (`git commit -m "test" && git push`).
- **Open an issue**: Go to **Issues** → **New issue** → submit.
- **Star the repository**: Click the ⭐ **Star** button.
- **Open a pull request**: Create a branch, edit a file, and open a PR.

**Check Recent Deliveries in GitHub**:
- Refresh the **Recent Deliveries** tab in GitHub.
- Each event should show a green checkmark `✔ 202 Accepted`.

**Check Stored Events in Database**:
Connect to PostgreSQL and verify the events:
```sql
SELECT id, event_type, status, received_at FROM events ORDER BY received_at DESC LIMIT 5;
```

**Test Redelivery (Duplicate Prevention)**:
- In GitHub's **Recent Deliveries** tab, click any delivery and click the **Redeliver** button.
- GitHub will resend the event with the same Delivery ID.
- Your server responds with `200 OK` (`"Delivery already received"`), and PostgreSQL will **not** insert a duplicate row.

---

## Structure

```
src/
├── config/            # env config
├── db/                # drizzle client, central schema, migrations
├── middlewares/       # error handler, 404
├── modules/           # feature modules (each one is self-contained)
│   ├── webhooks/      # webhook receiver, HMAC verification, ping/event handling
│   │   ├── webhook.controller.js
│   │   ├── webhook.routes.js
│   │   └── webhook.service.js
│   ├── events/        # events table schema & queries
│   ├── repositories/  # repositories table schema
│   ├── github-users/  # github sender accounts schema
│   └── users/         # starter user module
├── routes/            # mounts all module routers under /api/v1
├── utils/             # helpers (asyncHandler)
├── app.js             # express app setup
└── server.js          # entrypoint
```
