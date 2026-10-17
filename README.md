# Pabili v2 (Mrsool features + Pabili structure)

تطبيق واحد بثلاثة أدوار (عميل / سائق / متجر) على Expo + Supabase.

## التشغيل
1. أنشئ مشروع Supabase، ثم نفّذ `supabase/schema.sql` كاملاً في SQL Editor.
2. في Supabase: Authentication > Providers > Phone: فعّل مزود SMS (Twilio أو غيره). للتجربة أضف أرقاماً تجريبية مع كود ثابت.
3. انسخ `.env.example` إلى `.env` وضع الرابط والـ anon key.
4. `npm install` ثم `npx expo install --fix` (يضبط نسخ الحزم على Expo 54).
5. ضع مفتاح Google Maps في `app.json` (android.config.googleMaps.apiKey).
6. تجربة: `npx expo run:android`. ملف APK للتجربة: `eas build -p android --profile preview`.
7. (اختياري) مساعد الطلب بالذكاء الاصطناعي:
   `supabase functions deploy order-assistant` ثم `supabase secrets set ANTHROPIC_API_KEY=...`
   بدونه يعمل التطبيق، ويضيف نص العميل كبند في القائمة.

## الموافقة على السائقين والمتاجر
بعد تسجيلهم يظهر الطلب في جدول kyc_requests (والمستندات في bucket اسمه kyc).
راجعها من لوحة Supabase ثم نفّذ في SQL Editor: `select approve_kyc('<id>', true);`
لجعل حسابك إدارياً: `update profiles set role = 'admin' where id = '<user id>';`

## قبل النشر الفعلي (مهم)
- الدفع في هذه النسخة **محاكى** (`dev_payments = 1`). للإنتاج: اربط بوابة (PayMongo أو Xendit) عبر Edge Function،
  واجعل الـ webhook ينادي `confirm_payment(order, method, ref)`، ثم اضبط `dev_payments = 0`.
- الاسترجاع: عند الإلغاء تتحول الدفعة إلى `refund_pending`؛ نفّذ الاسترجاع الفعلي في البوابة ثم حدّثها إلى `refunded`.
- نسب العمولة (3% عميل / 8% متجر / 10% سائق) أرقام مبدئية في جدول app_settings.
- سحب أرصدة المحفظة (payout) غير مبني بعد.
- ثلاثة تطبيقات منفصلة: ابنِ ثلاث مرات مع `EXPO_PUBLIC_APP_ROLE=customer|driver|vendor`.
- لإرسال الطلبات للسائق حتى لو أغلق العميل التطبيق: فعّل pg_cron (السطر الأخير في schema.sql).

## ما لم يُبنَ
الطلب من أكثر من متجر في طلب واحد، عناوين محفوظة، تتبع السائق في الخلفية، إشعارات Push، لوحة إدارة.
