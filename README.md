# DLP Cost Estimator

Installable static PWA for estimating Disneyland Paris item costs in GBP after:

- Item discount
- Annual Pass discount
- VAT refund via SkipTax
- Latest EUR to GBP exchange rate

## Features

- Euro shelf-price input
- Annual Pass checkbox, preselected by default
- Item discount percentage input
- Settings for:
  - Annual Pass discount
  - French VAT rate
  - SkipTax refund share
  - Whether Annual Pass starts selected
  - Whether SkipTax starts selected
- Live EUR to GBP rate from Frankfurter's ECB-backed API
- Local rate caching for low-signal park use
- Installable PWA metadata and service worker
- iPhone install guidance and Android install prompt support

## Assumptions

The Euro price entered is treated as the VAT-inclusive shelf price.

Formula:

```text
afterItemDiscount = price * (1 - itemDiscountPct)
discounted = afterItemDiscount * (1 - annualPassDiscount)
vatPart = discounted * (vatRate / (100 + vatRate))
vatRefund = vatPart * vatRefundShare
finalEur = discounted - vatRefund
finalGbp = finalEur * eurToGbpRate
```

## Running locally

Because this is a static app, any simple web server will do. Examples:

```powershell
python -m http.server 8080
```

or

```powershell
py -m http.server 8080
```

Then open `http://localhost:8080`.

For PWA installation features, use HTTPS in production. Static hosts like Netlify, Vercel, GitHub Pages, or Cloudflare Pages are all suitable.
