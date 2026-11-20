# Senja Tas frontend

React + TypeScript static dashboard and customer chat for the six current n8n workflows.

## Local development

First prepare the backend using [local setup](../guide/local-setup.md). Use Node.js 24 and npm. From `frontend/`:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173/dashboard/` or `/chat/`. The root path belongs to n8n in production and is intentionally not a storefront.

`N8N_PROXY_TARGET` is a development-server setting; it is never sent to the browser. The default is `http://127.0.0.1:5678`. To use an SSH tunnel:

```powershell
# Run from the repository directory, in a separate terminal:
ssh -N -L 127.0.0.1:15678:127.0.0.1:5678 -i key-n8n-ec2.pem ubuntu@capstone-richard-khonan.duckdns.org

# In frontend/.env.local:
# N8N_PROXY_TARGET=http://127.0.0.1:15678
```

The tunnel uses your SSH access. Never bind it or the development server to a public network. Connecting directly to the HTTPS domain requires the existing Caddy owner credentials for administrative APIs.

## Features

- `/dashboard/`: overview, latest 100 orders with search/status filtering/pagination and detail dialog, unanswered questions, evaluation scores and per-question notes.
- `/chat/`: text/photo input, catalog source labels, refusal/escalation indicators, confirmation through the existing agent, session persistence for the current browser tab.
- Dashboard polling: every 30 seconds while visible; manual refresh; individual endpoint errors retain stale data with an explicit warning.
- Currency uses IDR; timestamps use Asia/Jakarta. Summary counts/values cover only loaded records, not lifetime totals or paid revenue.
- Evaluation may be partial: the current API has no separate run-status endpoint. Fewer than 20 results are explicitly identified as incomplete.
- Photo formats: JPEG/PNG/WebP up to 5 MB; compressed to JPEG at a maximum 1280-pixel edge. Photos are not persisted in browser storage.
- Text transcript and session ID are kept in session storage, limited to the latest 100 messages. Storage failures do not prevent chatting.
- Chat requests are never automatically retried. Timeout/network failures preserve the input and warn that an order could already have been recorded.
- Source labels are rendered as plain text; assistant content is never treated as HTML.

## API contracts

Same-origin production endpoints:

| Method | Route | Response |
| --- | --- | --- |
| GET | `/webhook/pesanan` | `{ data: Order[] }`, latest 100 |
| GET | `/webhook/tanpa-jawaban` | `{ data: Question[] }`, latest 100 |
| GET | `/webhook/skor` | `{ data: { run_id, ringkasan, detail } }` |
| POST | `/webhook/chat` | `{ session_id, jawaban, sumber?, ditolak, eskalasi, validasi, eskalasi_dicatat?, ada_foto? }` |

Chat input is `{ message, session_id, image_base64?, image_mime? }`. The current exports in `workflows/` use these unprefixed routes. A fresh backend requires importing and configuring them; see [local setup](../guide/local-setup.md). An existing configured backend needs no additional workflow import just to serve the frontend.

## Verification

```powershell
npm test
npm run build
npm run preview
```

Tests cover response contracts, nullable/partial evaluation results, PostgreSQL numeric values, fallback replies, authentication and malformed responses, timeout/no-retry behavior, and session recovery without persisted images.

For browser acceptance, check desktop and mobile, order search/detail, unanswered-question search, evaluation filters, photo preview/removal, chat response sources, refresh persistence, and network-error feedback. Test duplicate orders with clearly labeled demo data in a controlled session; do not create real fulfillment orders just to test the UI.

Owner-only voice questions are available on /chat/; see ../guide/voice-demo.md for setup, verification, and rollback. Payments, catalog/FAQ editors, order-status mutation, and running evaluations/ingestion from the dashboard remain deferred.

## Deployment

See `../guide/frontend-deployment.md`. Build output contains only static files; no Node server is needed on EC2. Existing Caddy owner credentials protect dashboard HTML and administrative webhooks. Do not put credentials or OpenAI keys into frontend environment variables.

