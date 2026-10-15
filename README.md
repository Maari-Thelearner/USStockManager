# USStockManager — Maari Portfolio

A single-user US-stock portfolio tracker designed for an Indian investor using INDmoney. Static frontend (GitHub Pages) + Cloudflare Worker API + Cloudflare D1. No paid services are required for the intended setup.

## Features
- Overview: invested principal, USD wallet balance, holdings, refreshed market quotes, P/L and recent activity.
- USD wallet funding history: INR sent, FX rate, GST/fees, USD credited, date and notes.
- Monthly plans: budget by month, target allocation percentages per asset, bought-to-date progress and remaining allocation.
- Buy orders: fractional shares, commission, principal excluding commission, CRUD history.
- Watchlist/assets: CRUD for ticker, name, category and allocation percentage.
- Settings: FX rate, GST, platform fee, default buy commission.
- D1 persistence. No localStorage-based portfolio database.

## Important notes
- Yahoo Finance chart endpoints are unofficial and may be rate-limited or changed. Quotes are refreshed only when you press Refresh Prices. The app keeps the last saved quote if refresh fails.
- The app is a tracker, not connected to INDmoney and does not place trades. Enter actual USD credited and actual order details from your INDmoney statements.
- Keep the API access key private. This is a personal app, not multi-user authentication.

## Setup overview
1. Create a Cloudflare D1 database named `usstockmanager-db`.
2. Apply `worker/schema.sql` to the database.
3. Deploy `worker/` as a Cloudflare Worker and bind D1 as `DB`.
4. Set Worker secrets/vars: `APP_ACCESS_KEY` and `ALLOWED_ORIGIN`.
5. Put the Worker URL and same access key into `site/config.js`.
6. Upload the contents of `site/` to a GitHub repository and enable GitHub Pages.

Detailed steps are in `SETUP.md`.
