# Backend Server

Node.js/Express backend for the Graho project.

## Tech Stack

- Node.js
- Express 5
- Sequelize + PostgreSQL
- Firebase Admin SDK
- Socket.IO
- Supabase
- Upstash Redis
- Twilio
- Razorpay
- Cloudinary
- OpenAI SDK
- Agora RTC
- Web Push
- Nodemailer
- Puppeteer

## Folder Structure

```
backend-server/
  config/            # Third-party service configs
  controller/        # Route controllers (feature-based)
  dbConnection/      # DB config and sync
  emailService/      # Email templates and senders
  middleware/        # Auth and role middleware
  mobileService/     # Mobile-specific helpers
  model/             # Sequelize models
  routes/            # Express routes
  services/          # Service layer
  supabaseConfig/    # Supabase helpers
  utils/             # Utility helpers
  server.js          # App entry
  .env               # Environment variables
```

## Clone

```
git clone <repo-url>
cd backend-server
npm install
```

## Environment Variables
### Internal OpenAI log ingestion (from astrology-engine)

To record OpenAI usage logs from other services (e.g. `astrology-engine` palm reading), set an internal token.

- `INTERNAL_LOG_TOKEN` - shared secret used to authenticate internal log ingestion.

The astrology-engine must POST logs to:

- `POST /api/internal/openai-request-logs`

with header:

- `x-internal-log-token: <INTERNAL_LOG_TOKEN>`

and its own env vars:

- `LOG_SINK_URL` = `https://<this-backend-host>/api/internal/openai-request-logs`
- `LOG_SINK_TOKEN` = same value as `INTERNAL_LOG_TOKEN`

Create a `.env` file in `backend-server/`.

For credentials refer notion page, link :  
https://www.notion.so/Graho-Credentials-and-Apis-keys-36bb3837c15f803db79ec57c8c5b7197

```
PORT=6001
JWT_SECRET=YOUR_JWT_SECRET
JWT_ACCESS_EXPIRES_IN=8m
JWT_REFRESH_EXPIRES_IN=15m
ACCESS_COOKIE_MAX_AGE_SECONDS=120
REFRESH_COOKIE_MAX_AGE_SECONDS=600
JWT_REFRESH_SECRET=YOUR_JWT_REFRESH_SECRET

COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

FIREBASE_PHONE_AUTH_SERVICE_ACCOUNT_PATH=./firebase-phone-auth.json
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-admin.json
FIREBASE_OTP_RATE_LIMIT_MAX_REQUESTS=10
FIREBASE_OTP_RATE_LIMIT_WINDOW_SECONDS=3600

SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_BUCKET=YOUR_SUPABASE_BUCKET
SUPABASE_STORAGE_URL=YOUR_SUPABASE_STORAGE_URL
SUPABASE_DB_HOST=YOUR_SUPABASE_DB_HOST
SUPABASE_DB_PORT=YOUR_SUPABASE_DB_PORT
SUPABASE_DB_NAME=YOUR_SUPABASE_DB_NAME
SUPABASE_DB_USER=YOUR_SUPABASE_DB_USER
SUPABASE_DB_PASS=YOUR_SUPABASE_DB_PASS

ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD

FRONTEND_URL=http://localhost:3000
FRONTEND_URL1=http://localhost:3001
FRONTEND_URL2=http://localhost:3000

GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:6001/api/auth/google/callback

TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=YOUR_TWILIO_PHONE_NUMBER

ASTRO_USER_ID=YOUR_ASTRO_USER_ID
ASTRO_API_KEY=YOUR_ASTRO_API_KEY
ASTRO_ENGINE_URL=http://localhost:8000/api/v1

RAZORPAY_KEY_ID=YOUR_RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_RAZORPAY_KEY_SECRET
NEXT_PUBLIC_RAZORPAY_KEY_ID=YOUR_RAZORPAY_PUBLIC_KEY_ID
RAZORPAY_WEBHOOK_SECRET=YOUR_RAZORPAY_WEBHOOK_SECRET

UPSTASH_REDIS_REST_URL=YOUR_UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN=YOUR_UPSTASH_REDIS_REST_TOKEN

AGORA_APP_ID=YOUR_AGORA_APP_ID
AGORA_APP_CERTIFICATE=YOUR_AGORA_APP_CERTIFICATE

OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_REALTIME_MODEL=YOUR_OPENAI_REALTIME_MODEL
OPENAI_CHAT_MODEL=YOUR_OPENAI_CHAT_MODEL

# Developer identity for OpenAI usage logging
DEVELOPER_NAME=YOUR_NAME
DEVELOPER_SECRET=YOUR_SECRET
SERVICE_NAME=backend-server
APP_ENV=development
REQUIRE_DEVELOPER_IDENTITY=true
INTERNAL_LOG_TOKEN=YOUR_INTERNAL_LOG_TOKEN

MAPS_API_KEY=YOUR_MAPS_API_KEY
TZ=Asia/Kolkata

CLOUDINARY_CLOUD_NAME=YOUR_CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET=YOUR_CLOUDINARY_API_SECRET

APPLE_TEAM_ID=YOUR_APPLE_TEAM_ID
APPLE_CLIENT_ID=YOUR_APPLE_CLIENT_ID
APPLE_KEY_ID=YOUR_APPLE_KEY_ID
APPLE_PRIVATE_KEY=YOUR_APPLE_PRIVATE_KEY
APPLE_REDIRECT_URI=YOUR_APPLE_REDIRECT_URI

WEB_PUSH_PUBLIC_KEY=YOUR_WEB_PUSH_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY=YOUR_WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT=mailto:hello@graho.in

# Temporary MSG91 OTP test route
MSG91_AUTH_KEY=YOUR_MSG91_AUTH_KEY
MSG91_OTP_TEMPLATE_ID=YOUR_MSG91_OTP_TEMPLATE_ID
OTP_QUEUE_WORKER_ENABLED=true
TEMP_MSG91_OTP_ENABLED=false
TEMP_MSG91_OTP_API_KEY=YOUR_RANDOM_INTERNAL_TEST_KEY
```

User and astrologer OTP sends use backend-generated 4-digit OTPs, Redis storage,
a Redis queue, and MSG91 delivery from an on-demand OTP worker. The worker wakes
when an OTP is queued, drains pending OTP jobs, then goes idle without polling
Redis. Each phone number is limited to 5 OTP requests per 1 hour.

## Temporary MSG91 OTP Route

Enable `TEMP_MSG91_OTP_ENABLED=true` only while testing, then call:

```http
POST /api/internal/temp-otp/send
x-internal-api-key: YOUR_RANDOM_INTERNAL_TEST_KEY
Content-Type: application/json

{
  "mobile": "9876543210",
  "otp": "1234"
}
```

The `otp` field is optional. When omitted, MSG91 generates the OTP. Optional
MSG91 template variables can be passed in a `variables` object.

## Firebase Service Account JSON (from Notion)

The Firebase Admin service account JSON files are provided in the Notion workspace.

1. Open the Notion page that contains the Firebase JSON files.
2. Download the required JSON file(s) to your local machine.
3. Copy them into the `backend-server/` root folder.
4. Update `.env` to point to those filenames.
link : https://www.notion.so/Graho-Credentials-and-Apis-keys-36bb3837c15f803db79ec57c8c5b7197
Example:

```
FIREBASE_PHONE_AUTH_SERVICE_ACCOUNT_PATH=./graho-xxxx-phone-auth.json
FIREBASE_SERVICE_ACCOUNT_PATH=./graho-xxxx-admin.json
```

## Run

```
# dev
npm run dev

#Use mobile data for run backend server not any private provider or wifi.
```
