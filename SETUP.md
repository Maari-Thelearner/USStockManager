# Step-by-step setup

## 1. Create the Cloudflare database
1. Sign in at https://dash.cloudflare.com/ and open **Workers & Pages → D1 SQL Database** (wording may vary).
2. Create a database named `usstockmanager-db`.
3. Open the database's **Console** and paste/run the complete contents of `worker/schema.sql`.

## 2. Deploy the Worker API
You can deploy using the Cloudflare dashboard (no paid software needed) or Wrangler.

### Dashboard route
1. Open **Workers & Pages → Create → Worker** and name it `usstockmanager-api`.
2. Deploy the starter Worker once, then open **Edit code**.
3. Replace the code with `worker/src/index.js` and deploy.
4. Open **Settings → Bindings**, add a **D1 database** binding named exactly `DB`, and select `usstockmanager-db`.
5. Under **Settings → Variables and Secrets**, add:
   - `APP_ACCESS_KEY`: a long random private string (at least 32 characters; don't publish it).
   - `ALLOWED_ORIGIN`: your GitHub Pages origin, for example `https://YOUR-USERNAME.github.io`. Do not include the repository path or trailing slash. During local testing you can temporarily set `*`, but replace it before publishing.
6. Save and redeploy. Copy the Worker URL, for example `https://usstockmanager-api.YOUR-SUBDOMAIN.workers.dev`.

### Wrangler route (optional)
1. Install Node.js LTS, then run `npm install -g wrangler` and `wrangler login`.
2. From the `worker` directory run `wrangler d1 create usstockmanager-db`; if it returns a database ID, put it into `wrangler.toml`.
3. Run `wrangler d1 execute usstockmanager-db --remote --file=schema.sql`.
4. Add secrets with `wrangler secret put APP_ACCESS_KEY`. Set `ALLOWED_ORIGIN` in `wrangler.toml`.
5. Run `wrangler deploy`.

## 3. Configure the website
1. Open `site/config.js`.
2. Set `API_BASE_URL` to your Worker URL (no trailing slash).
3. Set `APP_ACCESS_KEY` to the exact same key you configured in the Worker.
4. Save.

## 4. Publish on GitHub Pages
1. Create a GitHub repository named `usstockmanager` (or another name you prefer).
2. Upload **the files inside `site/`** to the repository root: `index.html`, `styles.css`, `app.js`, and `config.js`.
3. In repository **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, then save.
4. Your site will be at `https://YOUR-USERNAME.github.io/usstockmanager/`.
5. If the API reports a CORS error, update Worker `ALLOWED_ORIGIN` to exactly `https://YOUR-USERNAME.github.io`, redeploy, and reload the site.

## 5. First-time use
1. Open **Settings** and set your current/default FX rate, GST, platform fee and buy commission based on your INDmoney transaction details.
2. Open **Watchlist & Holdings** and add the ETFs/stocks you own or want to allocate to. Set each asset's target allocation percentage. Allocation percentages across all assets should total 100% (the app warns if they don't).
3. Open **USD Wallet** and record each funding event using the actual USD credited shown by INDmoney. FX, GST and fees are recorded for reference; wallet balance is calculated from USD credited minus buy-order spend.
4. Open **Monthly Plan**, set a budget for each month and check the allocation progress. Previous months are saved independently.
5. Add each purchase under **Buy Orders**. Use the actual total spent, commission and shares purchased from INDmoney. Principal is calculated as total spend minus commission.
6. In **Overview**, press **Refresh Prices** when you want to refresh the latest available quotes.

## Data model / calculations
- Wallet available = total USD credited − total buy-order spend. Buy-order spend includes commission.
- Invested principal = sum of buy orders' principal (total spend − commission).
- Current holding shares = sum of recorded shares purchased for each asset.
- Average cost/share = principal invested ÷ shares held.
- Market value = shares held × last refreshed quote.
- Unrealized P/L = market value − principal invested.
- Monthly target = monthly budget × asset allocation %. Monthly spent = total buy-order spend for that asset in the selected month. Remaining target is floored at zero; over-allocation is shown when spending exceeds target.

## Free quote source limitation
The app uses Yahoo Finance's publicly accessible chart endpoint via the Worker to avoid browser CORS. It is unofficial, has no service guarantee, and may limit requests. Use the refresh button manually and verify quotes before making investment decisions. The quote source is not a substitute for INDmoney's execution price.

## Troubleshooting
- **401 Unauthorized**: frontend `APP_ACCESS_KEY` must match Worker `APP_ACCESS_KEY` exactly.
- **CORS error**: `ALLOWED_ORIGIN` must equal the site origin only, e.g. `https://YOUR-USERNAME.github.io`.
- **D1 error / no table**: execute `schema.sql` against the same D1 database bound as `DB`.
- **Quotes unavailable**: ticker can be invalid, provider can throttle requests, or the market data endpoint can be unavailable. Other portfolio data still works.
- **Don't share the key**: GitHub Pages frontend keys are visible to anyone who can inspect the page. This is acceptable only for a personal low-sensitivity tracker with a private URL/repository and a key you can rotate; it is not strong authentication. For a public website or sensitive financial records, add proper authentication before using it.
