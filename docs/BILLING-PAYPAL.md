# Charging with PayPal Subscriptions

MATHEMA creates the subscription through PayPal's API, sends the customer to PayPal to approve it, then trusts only PayPal's own answer: it re-fetches the subscription on return, and it only accepts webhooks whose signature PayPal verifies. Card data never touches your server. Revenue is recorded **gross, in USD only**, and **PayPal's fee on each payment is recorded as a cost** (real fee when PayPal reports it in the webhook, otherwise your own estimate from Admin → Billing → *Fee estimate*, flagged "est."; if neither exists the payment is flagged and Finance warns that profit is overstated). Profit = revenue − PayPal fees − AI cost − expenses.

> Why PayPal: it works for a Costa Rica account and can withdraw to local banks (PayPal CR's withdrawal page lists USD/colón withdrawals to major banks). Stripe's availability for Costa Rica could not be confirmed from public sources — check `stripe.com/global`. Merchant-of-record services (Paddle, Lemon Squeezy) can also pay out via PayPal, but confirm they accept sellers from Costa Rica. **Verify in your own PayPal account** that *Subscriptions* is available for your business account and what the fees and withdrawal terms are before going live.

## 1. PayPal side (Developer dashboard → developer.paypal.com)
1. Use a **Business** PayPal account. In *Apps & Credentials*, **Sandbox** tab: create an app → copy **Client ID** and **Secret**.
2. *Subscriptions → Plans* (or Products → Plans): create a product "MATHEMA" and a plan **Pro**: USD 12 monthly (match the price you set in MATHEMA), auto-renew. Copy the **Plan ID** (`P-…`).
3. *Webhooks*: add the Webhook URL shown in **Admin → Billing (PayPal)** (`https://YOUR-DOMAIN/api/billing/paypal/webhook`) and subscribe to: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED`. Copy the **Webhook ID**.

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
| `PAYMENT.SALE.REFUNDED` / `REVERSED` (chargeback) | **negative payment** in the month it happens, matched to the original sale (or to the subscription); idempotent |
| `CUSTOMER.DISPUTE.CREATED` | audit-log entry only (funds may be held; you must respond in PayPal) |
| `CUSTOMER.DISPUTE.RESOLVED` in the buyer's favour | **negative payment** for the refunded amount; any other outcome is only audited |

Known limits: one currency (USD); the fee estimate is only as good as the percentage you enter (use the real figures from your PayPal fee schedule and compare with a PayPal statement); refunds are booked as negative revenue but **access is not revoked automatically** (cancel the subscription yourself if appropriate); PayPal fees on refunded payments are not returned in the books (PayPal's policy varies, so adjust by hand if yours refunds them); the dispute webhook field names could not be verified from public docs, so **test them with PayPal's sandbox webhook simulator / a sandbox dispute before going live** (if a payload does not match, the money-back is still audited, and you can book it by hand); proration/plan changes are not automated (cancel and re-subscribe).
