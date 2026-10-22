# Kindnod

The cookie consent banner that doesn't charge per page. This repo holds the parts of Kindnod that run on other people's sites or inside their tools, all MIT:

- `banner/kindnod.ts`: the consent banner itself. Google Consent Mode v2 defaults before any tag fires, script blocking, a Cookiebot-compatible JavaScript API and dataLayer events, Global Privacy Control, shadow DOM styling, consent carry-over from Cookiebot. Builds to a 17 KB IIFE with `npm run build`.
- `packages/kindnod`: the `kindnod` npm package. A React or Next.js component and a plain-JS loader for the keyless install.
- `agents/`: the skill, agent instructions, and Cursor rule that let a coding agent install Kindnod on a site with no human signing up first.
- `server.json`: the MCP registry listing for the hosted MCP server at `https://kindnod.com/api/mcp`.

The hosted parts (scanner, consent log, dashboard, geo-targeting, billing) live at [kindnod.com](https://kindnod.com) and are not in this repo.

## Install on a site

```html
<script src="https://kindnod.com/kindnod.js" data-owner="you@example.com" async></script>
```

No account is needed. The site is created on first load and the owner claims the dashboard from the email sent to `data-owner`. Docs: [kindnod.com/docs](https://kindnod.com/docs). For agents: [kindnod.com/llms.txt](https://kindnod.com/llms.txt).

## Build the banner

```bash
npm install
npm run build   # writes dist/kindnod.js
```

## License

MIT. See `LICENSE`.
