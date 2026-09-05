# Only Us Two

A browser-based, link-paired, end-to-end encrypted anonymous messenger, plus a landing page and a small admin dashboard for the banner/stats.

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE) — free to view, use, and modify for any noncommercial purpose; commercial use requires the licensor's permission.

## Files

- **`index.html`** — the landing page.
- **`app.html`** — the actual app.
- **`console-383fdc03.html`** — passcode-protected dashboard: toggle the landing page banner, edit founding-supporter names or sponsor info, check room/message counts. Not linked from anywhere public — access it directly at your-domain/console-383fdc03.html.

## Self-hosting this from scratch

1. **Fork/clone both repos**: this one (`onlyus2`, the frontend) and `onlyus2-api` (the Worker backend).
2. **Cloudflare Pages**: create a new Pages project, connect it to your fork of this repo, branch `main`, no build command needed (it's static HTML) — it deploys automatically on every push after that.
3. **Cloudflare Worker**: create a Worker named however you like, paste `worker.js`'s contents into its Edit Code screen, Deploy. (Note: pushing to the `onlyus2-api` repo does **not** auto-deploy the Worker unless you separately set up Cloudflare's Git-connect import for Workers — the manual paste-and-deploy path above always works regardless.)
4. **KV namespace**: create one in the Cloudflare dashboard, then bind it to the Worker as `OU2_KV` (Worker → Settings → Variables → KV Namespace Bindings).
5. **`ADMIN_KEY` secret**: see the next section below.
6. **Point the frontend at your Worker**: `index.html`, `app.html`, and `console-383fdc03.html` each have an `API_BASE` constant near the top of their `<script>` — set all three to your Worker's URL (`https://your-worker-name.your-subdomain.workers.dev`).
7. **Lock CORS to your domain**: `worker.js` has an `ALLOWED_ORIGIN` constant — set it to your actual domain (e.g. `https://yourdomain.com`), not `*`, before going live.
8. **Custom domain** (optional but recommended): attach your own domain to the Pages project in Cloudflare, rather than using the `pages.dev` subdomain, for a cleaner share experience.

## One-time backend setup for the admin/banner features

In the Cloudflare dashboard, on the `onlyus2-api` Worker:

1. **Settings → Variables and Secrets → Add**
   - Name: `ADMIN_KEY`
   - Type: **Secret** (not plain text — this keeps it out of view in the dashboard and out of any exported config)
   - Value: any long random string you choose — this is what `console-383fdc03.html` will ask you to enter
2. Deploy the updated `only-us-two-worker.js` (paste the whole file into Edit code, replacing what's there, Deploy).

That's it — `console-383fdc03.html` and the landing page banner will work as soon as both are live.

## What the admin key actually protects

It's a shared secret checked by the Worker on every `/admin/*` request — solid against someone randomly finding the admin page, not real user authentication. Don't reuse a password you care about, and there's no recovery flow if you lose it other than setting a new `ADMIN_KEY` value in the same dashboard screen.

## Deploying

Same as before — upload/push all files to the GitHub repo connected to your Cloudflare Pages project; it redeploys automatically on push to `main`.

## On stats

Room/message counts in the admin page are free to check (Cloudflare KV's `list` is a read operation, doesn't touch your write quota). Deliberately NOT tracking a "writes today" counter in the app itself — that would double real write usage against the 1,000/day free-tier cap by adding a write for every write. That number already exists natively in Cloudflare's dashboard (Worker or KV namespace → Metrics tab) — check there.

## On advertising / monetization

Affiliate programs need something to track a referral to — a signup, an account. This app deliberately has neither, so there's no technical hook for one to attach to, separate from the privacy question. "Founding supporters" (a plain, honor-system name list) and a future paid sponsor slot (a plain link, optionally with your own image) are what's actually built — no tracking involved in either.

## Home-screen icon

`app.html` now embeds a proper icon for "Add to Home Screen" on both iOS and Android — the wax seal, baked in as base64 PNGs directly in the file (32×32 favicon, 180×180 for iOS, 192×192 and 512×512 for Android's manifest). Nothing else to configure; it just works once this file is deployed.

**To swap it for a different design later**: generate new PNGs at those same four sizes, base64-encode them, and replace the corresponding `data:image/png;base64,...` strings near the top of `app.html`'s `<head>`. No other code needs to change — the manifest and all the link tags stay exactly as they are.

## Self-hosted fonts and QR libraries

`app.html` no longer loads anything from Google Fonts or cdnjs — every font and both QR libraries are embedded directly in the file (fonts as base64 data URIs via `@font-face`, the libraries inlined as plain `<script>` tags). This closes a real gap: those third parties previously learned "someone opened this page, right now" on every single visit, independent of anything the app itself does or doesn't log.

Trade-off, stated plainly: this makes the file meaningfully larger (~440KB vs. ~140KB before) — a one-time load cost, not a per-message one, and a fair trade for what it removes.

## Known limitations

- **The encryption has not had external/independent review.** This is the top outstanding item. It's a standard-looking construction (ECDH P-256 pairing, HKDF, a ratcheting HMAC chain deriving a fresh AES-GCM key per message) built and reviewed only by whoever's worked on this code — that is not the same thing as a security audit. Treat it accordingly until it's had real outside scrutiny.
- **Joining a room isn't perfectly atomic.** Cloudflare KV has no atomic read-modify-write, so a join reads the room, checks it's still open, then writes — there's a small theoretical race if two people hit the exact same join link in the exact same instant. Deliberately left as-is rather than patched with an untested fix: for a two-person pairing tool this is a low-probability edge case, and a "clever" concurrency fix shipped without a way to actually test it under race conditions would risk being worse than the documented limitation. See the comment above the relevant code in `onlyus2-api`'s `worker.js` for the exact mechanics.

## Contact email

`admin@onlyus2.com` is now on the landing page footer. Writing it into the page doesn't make it receive mail on its own — set up forwarding once, whenever convenient:

**Cloudflare → your domain → Email → Email Routing** → add `admin@onlyus2.com`, forward to a real inbox you check. Same screen also supports a **catch-all rule** — forwards *any* address at the domain (`hello@`, `founders@`, whatever) to the same inbox, so you're not locked into just this one address if a different one makes sense somewhere later.
