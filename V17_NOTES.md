# Pabili PH — V17: real multi-phone engine + Rides

## Run once (Supabase SQL editor, in this order)
setup-04-v16.sql (if not done) → **setup-05-v17.sql**

## Test with TWO phones (a phone cannot be both sides of the same order)
Login codes: any number + 2067 (admin: 0562989152 + 1785).
1. Phone A (store owner): My Page → Register my store → upload docs → submit.
2. Phone B (driver):      My Page → courier mode → submit driver docs.
3. Admin phone:           KYC tab → Approve both. Users tab → credit a wallet if you want to test wallet payment.
4. Phone B: switch to courier mode → Online (allow location "all the time").
5. Phone C (customer, or A's second number): Home → order from the store, or 🚕 Need a ride?
6. Watch it travel: store quote+photo → customer accepts/counters → courier offer (timer) → accept/counter → pack → pickup photo → delivery photo → confirm → wallets settle.
   Ride: request → offer to nearest online driver → accept/counter → arrived → start trip → end trip → confirm.

## Status flow
Order: vendor_quote → quote_review ⇄ vendor_talk → finding_driver → driver_offer ⇄ driver_talk → accepted → ready_pickup → picked_up → delivered → completed
Ride : finding_driver → driver_offer ⇄ driver_talk → accepted → ready_pickup (arrived) → picked_up (trip) → delivered → completed
