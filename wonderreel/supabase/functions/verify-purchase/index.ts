// Google Play Billing / App Store receipt verification.
// NOT ACTIVE: needs a Play Console app, in-app products, and a Google service account
// (GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) with the Android Publisher API. Until then this
// refuses every purchase instead of pretending to grant credits.
import { handler, HttpError, requireUser } from '../_shared/http.ts';

Deno.serve(handler(async (req) => {
  await requireUser(req);
  if (!Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) {
    throw new HttpError(501, 'In-app purchases are not set up yet.');
  }
  // Implementation plan (docs/STATUS.md): verify purchaseToken with
  // androidpublisher.purchases.products.get, insert into purchases (unique token = idempotent),
  // add a 'purchase' credit_ledger row, acknowledge the purchase, handle RTDN refunds.
  throw new HttpError(501, 'Purchase verification is not implemented yet.');
}));
