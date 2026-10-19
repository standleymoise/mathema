# Charging with PayPal Subscriptions

MATHEMA creates the subscription through PayPal's API, sends the customer to PayPal to approve it, then trusts only PayPal's own answer: it re-fetches the subscription on return, and it only accepts webhooks whose signature PayPal verifies. Card data never touches your server. Revenue is recorded **gross, in USD only**.

> Why PayPal: it works for a Costa Rica account and can withdraw to local banks (PayPal CR's withdrawal page lists USD/colón withdrawals to major banks). Stripe's availability for Costa Rica could not be confirmed from public sources — check `stripe.com/global`. Merchant-of-record services (Paddle, Lemon Squeezy) can also pay out via PayPal, but confirm they accept sellers from Costa Rica. **Verify in your own PayPal account** that *Subscriptions* is available for your business account and what the fees and withdrawal terms are before going live.

## 1. PayPal side (Developer dashboard → developer.paypal.com)
1. Use a **Business** PayPal account. In *Apps & Credentials*, **Sandbox** tab: create an app → copy **Client ID** and **Secret**.
2. *Subscriptions → Plans* (or Products → Plans): create a product "MATHEMA" and a plan **Pro**: USD 12 monthly (match the price you set in MATHEMA), auto-renew. Copy the **Plan ID** (`P-…`).
3. *Webhooks*: add the Webhook URL shown in **Admin → Billing (PayPal)** (`https://YOUR-DOMAIN/api/billing/paypal/webhook`) and subscribe to: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`. Copy the **Webhook ID**.

## 2. MATHEMA side
1. Set the env var `PUBLIC_URL=https://YOUR-DOMAIN` (so return URLs are exact behind Hostinger's proxy) and redeploy.
2. **Admin → Billing (PayPal)**: mode `sandbox`, Client ID, Secret, Webhook ID → Save → **Test connection**.
3. **Admin → Users & plans → Plans**: paste the PayPal Plan ID in the **Pro** row (its price/quota are yours to edit) → Save.
4. Test with a **sandbox buyer account** (developer.paypal.com → Sandbox → Accounts): sign in to MATHEMA, **Plans → Subscribe with PayPal**, approve with the sandbox buyer. You should land back on *Subscription active*, see MRR in **Finance**, and a payment after PayPal's `PAYMENT.SALE.COMPLETED` webhook.
5. Test cancel (Plans → Cancel subscription) and a failed webhook (wrong Webhook ID → nothing is activated).

## 3. Go live
Repeat step 1 in the **Live** tab (new Client ID/Secret, a **live** plan with its own `P-…` id, a live webhook and its id), switch mode to `live`, update the plan id, and make one real purchase yourself (you can refund it in PayPal).

## How money and states map
| PayPal event | MATHEMA |
|---|---|
| Customer returns, subscription `ACTIVE` | plan = Pro, subscription `active` |
| `BILLING.SUBSCRIPTION.ACTIVATED` | same (idempotent) |
| `PAYMENT.SALE.COMPLETED` (USD) | payment recorded once (gross) |
| `…SUSPENDED` / `PAYMENT.FAILED` | `past_due` (excluded from MRR, shown as "at-risk") |
| `…CANCELLED` / `EXPIRED` / customer cancels | `canceled`, plan back to Free |

Known limits: one currency (USD); fees are not subtracted; refunds/disputes must be recorded by hand (Admin → Payments, negative amount); proration/plan changes are not automated (cancel and re-subscribe).
