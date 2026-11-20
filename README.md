# ReJenga

ReJenga is a responsive pilot app for coordinating reusable smartphone parts around MKU, Thika. It keeps donor descriptions, catalogue compatibility rules, technician inspection records and handover outcomes separate.

## Run locally

Requires Node.js 22.13 or later and a Neon PostgreSQL database.

```powershell
Copy-Item .env.example .env
npm install
npm run admin:create -- "Pilot Administrator" admin@example.org "Use-a-unique-password-12"
npm run dev
```

Set `DATABASE_URL` to your Neon PostgreSQL connection string and `SESSION_SECRET` to a unique random value of at least 32 characters. On startup, ReJenga creates the schema and seeds the starter catalogue. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` before using email verification. ReJenga sends a six-digit code that expires after 15 minutes; codes are single-use, limited to five attempts, and can be resent after one minute. Donor and recipient accounts activate automatically after email verification. A database account created before verification can request a new code from the sign-in page. If SMTP is unavailable or unconfigured, registration displays an error and does not activate the account.

Open `http://localhost:5173`. The Vite development server proxies API requests to `http://localhost:3001`. Create the first administrator with `npm run admin:create -- "Pilot Administrator" admin@example.org "Use-a-unique-password-12"` after setting `.env`; there is no public administrator registration. Administrators may grant technician access to verified users.

## Deploy to Vercel

Import the GitHub repository into Vercel. The included Vercel configuration builds the Vite frontend and exposes the Express API as a serverless function. Add these environment variables in the Vercel project settings for every environment you use:

- `DATABASE_URL`: Neon PostgreSQL connection string (use the pooled connection string).
- `SESSION_SECRET`: a unique random secret of at least 32 characters.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: SMTP credentials and verified sender details for email codes.

The database schema and starter catalogue are created automatically when the API starts. Create the initial administrator once by running `npm run admin:create -- "Pilot Administrator" admin@example.org "Use-a-unique-password-12"` in an environment configured with the same `DATABASE_URL`, or locally after putting the production connection string in `.env`. Do not commit `.env` or paste secrets into source files.

Deploying does not copy existing SQLite accounts, listings, images or requests into Neon. If you have pilot data that must be kept, export and migrate it before switching users to the deployed app.

### Starter catalogue

Models: Tecno Spark 10, Spark 20, Spark 20C, Camon 20 and Pop 8; Samsung Galaxy A14, A05, A05s and A15; Infinix Hot 30, Hot 40i, Smart 8 and Note 30; itel A60s and A70; Xiaomi Redmi 12C and 13C; OPPO A18.

Repair part types: screen, battery, charging board, charging port, camera, front camera, rear camera, loudspeaker, earpiece speaker, microphone, power/volume button flex, back cover and fingerprint sensor. This is an editable starting list, not a measured ranking of repair frequency. No compatibility rules are assumed: an administrator must add a rule and its source before a candidate can be suggested.

## Included workflows

- Account registration, email-code verification, role assignment and sign-in for administrators, technicians, donors and recipients.
- Donor device and part listings, with approximate location, donor-described condition and private image storage.
- Recipient repair requests and explanations for catalogue-compatible, available candidate parts.
- Candidate ranking by inspection status and exact approximate-area match. ReJenga does not calculate distance or collect continuous GPS data.
- Atomic part reservation, technician decisions (accepted, rejected or unsafe), in-app notifications and requester-recorded handover outcomes.
- Administrator catalogue, account and listing management, plus basic activity counts.
- Focused matching tests, TypeScript checking and a production Vite build.

## Image classification

The proposal calls for supervised classification of supported phone models or visible damage using a trained model and permitted, labelled images. No training images, model weights or inference service were included with the proposal. ReJenga therefore does **not** make up predictions: without a classifier configured, a listing clearly shows that classification is unavailable and model/condition data remains unverified.

To connect a separately prepared local inference service, set `REJENGA_CLASSIFIER_URL` to an HTTP endpoint on `localhost`, `127.0.0.0/8` or `::1`. It must accept multipart form data under `image` and return JSON shaped like `{"predictionType":"visible_damage","predictedClass":"cracked_front_screen","confidence":0.87}`. Device-model labels must exactly match an active catalogue model; visible-damage labels must be one of `cracked_front_screen`, `broken_front_screen`, `cracked_back_cover`, `broken_camera_lens`, `no_visible_external_damage` or `unknown`. The API rejects non-loopback hosts and redirects so listing photos are not sent to a third party. Predictions are stored with their type and confidence, remain advisory, and never decide part safety or internal health. Scores below 60% are flagged as low confidence; this is a pilot display heuristic, not a validated accuracy threshold. Model training, labelled-data collection/permissions and evaluation metrics remain to be completed with approved data.

## Pilot boundaries

The app does not handle payments, arrange transport or storage, perform repairs, certify a guarantee, or infer internal component condition from photos. Unsafe listings are excluded from matching and marked blocked. A “completed” outcome records what users report; it does not mean ReJenga verified the physical handover or repair.

This is a pilot prototype, not a production-hardened commercial service. Use HTTPS and secure operational controls before exposing it beyond a trusted pilot.
