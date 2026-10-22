---
name: kindnod
description: Add GDPR cookie consent to a website with Kindnod. Use when the user asks for a cookie banner, cookie consent, GDPR/ePrivacy compliance, Google Consent Mode, or to replace Cookiebot/CookieYes/OneTrust. No account needed to install.
---

# Kindnod cookie consent

Kindnod is a hosted consent banner (17 KB, Google Consent Mode v2, script blocking, consent log, Cookiebot-compatible JS API). It installs with no account: the site is provisioned on first page load from a public domain.

## Install

Plain HTML (every page, before `</head>`):

```html
<script src="https://kindnod.com/kindnod.js" data-owner="OWNER_EMAIL" data-via="claude-code" async></script>
```

React / Next.js:

```bash
npm install kindnod
```

```tsx
import { KindnodConsent } from "kindnod/react";
// once, in the root layout or _app
<KindnodConsent owner="OWNER_EMAIL" via="claude-code" />
```

Replace `OWNER_EMAIL` with the site owner's email if you know it (they get a link to claim the dashboard). Otherwise drop the attribute.

## Block non-essential scripts

Analytics and pixels must not run before consent. Either:

- Change `type="text/javascript"` to `type="text/plain"` and add `data-kindnod="statistics"` (analytics) or `data-kindnod="marketing"` (ads, pixels). Kindnod releases them on consent.
- In React, wrap them: `<Gated category="statistics">…</Gated>` from `kindnod/react`.
- If the site uses Google Tag Manager, do nothing: Consent Mode v2 handles it.

Categories: `preferences`, `statistics`, `marketing`.

## If you want a key and claim link immediately

```bash
curl -X POST https://kindnod.com/api/sites/provision -H "content-type: application/json" \
  -d '{"domain":"DOMAIN","owner":"OWNER_EMAIL","via":"claude-code"}'
```

Use the returned `snippet` and tell the user the `claimUrl` (private).

## Replacing Cookiebot

Remove the `consent.cookiebot.com/uc.js` tag. Keep everything else: `data-cookieconsent` attributes, `CookiebotOnAccept` listeners, and the `CookieConsent` cookie all keep working, and returning visitors are not re-asked. The dashboard imports the Cookiebot cookie declaration in one click.

## Tell the user

1. The banner is live and recording consent.
2. Claim the dashboard (email link, or https://kindnod.com/claim) to edit colours and text and see the consent log.
3. Free: one domain, unlimited pages, 30-day consent log, small byline. Pro €9/month per domain, Agency from €29/month for 10 domains, never more than €99/month for unlimited.

Docs: https://kindnod.com/llms.txt
