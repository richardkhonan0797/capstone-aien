# Voice demo and rollback

Voice is a small owner-only presentation feature on `/chat/`. It uses the existing Chat Agent through `/webhook/chat`; only the Realtime Token workflow is modified. The other five workflows and database schema are unchanged.

## Presenting

1. Use desktop Chrome or Edge on the HTTPS site. Open `/dashboard/` and complete the existing Caddy owner login in the same browser profile. This is separate from n8n login.
2. Open `/chat/`, click **Mulai suara**, and allow the microphone.
3. Wait for **Silakan bicara**, then ask a product/stock/policy question in Indonesian.
4. Wait while the catalog is checked. The microphone pauses during the tool lookup and its spoken answer. Questions and original backend answers, including source labels, appear in the chat.
5. Click **Akhiri** before using text/photo chat or demonstrating an order.

Example questions: “Berapa harga dan stok Tas Ransel Harian Hitam?”, “Bagaimana kebijakan retur?”, “Bisa bayar COD?”

Voice uses a fresh `voice-...` session for every call. Text retains its existing `web-...` session. Visible voice messages are kept in the same tab transcript, but the text agent does not receive voice history. No recordings or temporary tokens are saved by the frontend. AI-generated voice is disclosed in the panel.

The questions-only scope is enforced through the voice instructions, not a new backend authorization boundary. The existing Chat Agent still has its original tools. Do not demonstrate order confirmation through voice. Failed requests are never retried automatically.

## Deployment

Pre-voice server backup: `/opt/capstone/voice-backups/before-voice-20261119/`. It includes the deployed token workflow, Caddyfile and previous frontend release pointer. Do not overwrite or delete it.

Upload the build, updated Caddy template, `deploy/voice_demo.py`, and the Realtime Token JSON (as `/opt/capstone/deploy/realtime-token-voice.json`). From `/opt/capstone`:

```bash
python3 deploy/voice_demo.py check
python3 deploy/voice_demo.py install
python3 deploy/deploy_frontend.py
```

The workflow installer preserves live credentials and node IDs, changes only the realtime request and explanatory note, publishes the token workflow, and restarts n8n to activate the imported version. Expect a brief n8n interruption. It verifies token creation without printing the token and compares the other workflow exports before and after. Failed workflow installation attempts restore the original token workflow. Frontend deployment uses its existing independent rollback helper.

The exact production `/webhook/realtime-token` route requires owner authentication and returns 401 without it. Token subpaths, legacy/test token endpoints, and MCP endpoints stay blocked. Text chat remains public.

## Restore the deployed version before voice

From this project's PowerShell terminal:

```powershell
ssh -i key-n8n-ec2.pem ubuntu@capstone-richard-khonan.duckdns.org "cd /opt/capstone && python3 deploy/voice_demo.py rollback"
```

This restores the original frontend release and Caddyfile, reimports the original Realtime Token workflow and restores its activation state, then restarts n8n. Refresh the browser afterward. It does not erase orders, chat memory, execution history, or logs created during testing. Other workflows are untouched.

## Restore local source too

Local backup: `backup/before-voice-20261119-091416/`. It contains the original frontend source, deployment files, workflow exports, documentation, and workflow hashes.

```powershell
powershell -ExecutionPolicy Bypass -File deploy/rollback_voice_local.ps1
cd frontend
npm.cmd run build
```

Local rollback overwrites the files changed for voice and removes only the three new voice source files. It leaves the backup and rollback documentation/helpers available. Run it only when you intend to discard subsequent changes to those files. This does not roll back EC2; use the server command above as well.

## Verification

Run `npm.cmd test` and `npm.cmd run build` in `frontend`. Rehearse microphone permission, an actual spoken question, a follow-up, hang-up, and restarting a call. Test denied microphone access and unauthenticated token access. Verify text/photo chat still works after hanging up. Use text chat if the presentation network or audio device fails.
