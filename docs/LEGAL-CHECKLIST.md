# Legal checklist (not legal advice)

The in-app Terms, Privacy Policy and AI notice are **template text written to match what the software actually does**. They are not a substitute for a lawyer. Before taking real payments:

- [ ] A lawyer in Costa Rica reviews the Terms and Privacy Policy (governing law, liability limits, refund policy, minimum age).
- [ ] Data protection: the privacy text mentions Costa Rica's Law 8968 (personal data). Ask your lawyer whether you must register a database with PRODHAB and what notices are required. If you will have users in the EU/UK, GDPR-type duties (legal basis, processor agreements, international transfers) may apply.
- [ ] Processors: confirm the terms of Hostinger, Anthropic, OpenAI and PayPal and whether you need data-processing agreements. The Privacy page states that idea text is sent to AI providers only when AI analysis is used.
- [ ] Tax and invoicing: ask an accountant how to report PayPal income in Costa Rica (individual vs. company, VAT/IVA on digital services, invoicing obligations). MATHEMA records gross USD payments; it does not issue invoices.
- [ ] Fill **Admin → Beta & legal** with the legal name and contact email shown in the legal pages.
- [ ] Decide the refund policy and update the Terms text (it currently says: case by case).
- [ ] Keep the scientific disclaimer (AI notice) prominent: models are hypotheses, not validated findings.
- [ ] Incident plan: who tells users if there is a data breach; keep backups of MySQL and of `APP_SECRET`.

Implemented in the product: explicit consent checkbox at sign-up (timestamp stored), self-service **data download** and **account deletion** (cancels the PayPal subscription first), password hashing, encrypted provider keys, essential cookie only.
