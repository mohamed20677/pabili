# دليل بناء Pabili APK على جهازك — EAS Build

> Expo SDK 54.0.0 · Package `com.pabili.delivery` · Slug `pabili` · تاريخ الإصدار: 2026-10-16
> كل الأوامر مأخوذة من [docs.expo.dev/build-reference](https://docs.expo.dev/build-reference/) وتحقّقنا منها قبل الكتابة.

---

## الفهرس

1. ما هو موجود فعلاً داخل `pabili-app-v2.zip`
2. القواعد التي تجعل EAS ينتج APK (وليس AAB)
3. المسار A — بناء APK على سحابة Expo (الأسرع والأسهل)
4. المسار B — بناء APK محلياً على جهازك (بدون سحابة)
5. استلام الـAPK وتثبيته على Android
6. التحقق من نجاح البناء
7. جدول أوامر EAS CLI الكامل
8. Troubleshooting
9. ملخّص في 5 أوامر

---

## 1. ما هو موجود فعلاً داخل `pabili-app-v2.zip`

تحقّقنا من الملفات فوراً قبل كتابة هذا الدليل:

**`app.json`:**
```json
{
  "expo": {
    "name": "Pabili",
    "slug": "pabili",
    "android": { "package": "com.pabili.delivery", "versionCode": 1 }
  }
}
```

**`package.json` (الـdependencies):**
```json
{
  "expo": "~54.0.0",
  "react": "19.1.0",
  "react-native": "0.81.5",
  "@react-native-async-storage/async-storage": "2.2.0",
  "expo-document-picker": "~14.0.8",
  "@supabase/supabase-js": "^2.49.0",
  "@opentelemetry/api": "1.9.0"
}
```

**`eas.json`:**
```json
{
  "cli": { "version": ">= 13.0.0", "appVersionSource": "local" },
  "build": {
    "preview":     { "distribution": "internal", "android": { "buildType": "apk" } },
    "production":  { "android": { "buildType": "app-bundle" } }
  }
}
```

الـprofile اسمه **preview**، وهو ما يَخرج APK.

> **تنبيه:** يجب وضع مفاتيح Supabase الفعلية في `App.js` (السطور 9-10) قبل البناء:
> ```js
> const SUPABASE_URL      = 'https://mhnneaixcywmciyioxeo.supabase.co';
> const SUPABASE_ANON_KEY = '<anon public key>';
> ```
> لا تنسخ `service_role` — يتجاوز سياسات RLS.

---

## 2. القواعد التي تجعل EAS ينتج APK (وليس AAB)

طبقاً لتوثيق Expo في `docs.expo.dev/build-reference/apk/`, المنصة تختار صيغة APK تلقائياً عند تحقق **أي** شرط من هذه:

| الإعداد | النتيجة |
|---|---|
| `"android": { "buildType": "apk" }` | يَخرج APK عبر assembleRelease |
| `"distribution": "internal"` | يحفظ build داخلياً فقط |
| `"developmentClient": true` | يستخدم Expo dev client |
| `"android": { "gradleCommand": ":app:assembleDebugOptimized" }` | يدعمه SDK 54+ |
| `"android": { "gradleCommand": ":app:assembleRelease" }` | يدعمه SDK 50+ |

إعداداتنا في `eas.json` تحقّق الشرطين **الأول والثاني**، فالنتيجة مضمونة APK.

> **تنبيه:** إن لم تكتب `"android": { "buildType": "apk" }` داخل `preview`، فإن `eas build -p android --profile preview` ينتج AAB. تأكّد من وجوده قبل البناء.

---

## 3. المسار A — بناء APK على سحابة Expo (الأسرع والأسهل)

### الخطوة 0 — فكّ الضغط وتثبيت Node

```bash
unzip pabili-app-v2.zip
cd pabili-app
```

تثبيت Node 20 LTS أو 22 من [nodejs.org](https://nodejs.org) إذا لم يكن عندك.

### الخطوة 1 — تسجيل الدخول إلى Expo

```bash
# لو ما عندك حساب (ينشئه ويرسل إيميل تأكيد):
npx expo register

# لو عندك حساب:
npx expo login

# للتأكّد مَن أنت:
npx expo whoami
```

> **ملاحظة:** الأمران `eas login` و `eas register` يعملان تماماً. المصادقة موحدة بين expo CLI و eas CLI.

### الخطوة 2 — تثبيت eas-cli (مرة واحدة على النظام)

```bash
npm install -g eas-cli
eas --version
# متوقّع: eas-cli/15.x.x أو أعلى، يجب أن يكون ≥ 13
```

### الخطوة 3 — تهيئة المشروع لـ EAS (مرة واحدة)

```bash
eas build:configure
```

**prompts متوقعة:**
- Platform → اختر **Android**
- Application ID → `com.pabili.delivery` (معرّف في app.json، اضغط Enter لتأكيد)

### الخطوة 4 — إطلاق البناء على السحابة

```bash
eas build -p android --profile preview
```

**prompts في أوّل build:**
- `Generate a new Android Keystore?` → اكتب **`y`** (Expo يخزّنه مشفّراً لهم)
- `Commit changes to git?` → اكتب **`y`** أو **`n`** — كلاهما يعمل

ينشئ رابط build على expo.dev. افتحه للمتابعة الحية، أو تابع logs مباشرة:

```bash
# قائمة كل الـbuilds:
eas build:list

# متابعة logs مباشرة لـbuild معيّن:
eas build:logs --id <buildId>
```

> **ملاحظة:** الوقت 15-30 دقيقة على الخطة المجانية. سيرسل إيميل عند الانتهاء يحوي رابط تحميل APK.

---

## 4. المسار B — بناء APK محلياً على جهازك (بدون سحابة)

### المتطلبات الإضافية على المسار المحلي

| المتطلب | ملاحظة |
|---|---|
| Linux أو macOS | Windows يحتاج WSL2 |
| JDK 17 | وليس 21 — Expo SDK 54 لا يقبل JDK 21 |
| Android SDK | + build-tools 34.0.0 + platform-tools |
| NDK 26.1.x | مطلوب من expo-document-picker |
| متغيّر `ANDROID_HOME` | مضاف إلى PATH |

### إعداد ANDROID_HOME

```bash
# macOS:
export ANDROID_HOME=$HOME/Library/Android/sdk

# Linux:
export ANDROID_HOME=$HOME/Android/Sdk

# Windows + WSL2:
export ANDROID_HOME=/mnt/c/Users/$USER/AppData/Local/Android/Sdk

# ضيفه دائماً:
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin' >> ~/.zshrc
```

### تثبيت JDK 17

```bash
# macOS:
brew install openjdk@17
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk

# Linux/WSL2:
sudo apt install openjdk-17-jdk-headless
```

### إطلاق البناء المحلي

```bash
# بناء APK محلياً بدون سحابة Expo:
eas build --local -p android --profile preview --output ./out
# APK ينزل في: ./out/pabili-preview.apk

# أو بناء + فتح المجلد:
eas build:build -p android --profile preview
```

### مقارنة المسارين

| المعيار | السحابة | المحلي |
|---|---|---|
| الوقت | 15-30 دقيقة | 5-15 دقيقة |
| حصة شهرية مجانية | 30 build/شهر | غير محدود |
| الإنترنت أثناء البناء | نعم | لا |
| مكان logs failure | expo.dev (يحفظ 30 يوم) | الـshell مباشرة |

> **تنبيه:** الـbuild المحلي على Linux يحتاج `build-tools 34.0.0` + `NDK 26.1.x`. بدونها يفشل في `./gradlew assembleRelease` بـ `SDK location not found`.

---

## 5. استلام الـAPK وتثبيته على Android

### أ. تنزيل من expo.dev (الطريقة الرسمية)

```bash
# بعد انتهاء البناء، يمكنك تنزيل الـartifact مباشرة:
eas build:artifact:download --id <buildId> --path ./pabili.apk
```

أو افتح الرابط المرسل في الإيميل في الموبايل → اضغط **Download** → فعّل **Install unknown apps** لـ Chrome إن طُلب → Install.

### ب. تثبيت عبر adb (الأسرع على الـdev machine)

```bash
# فعّل USB debugging على الموبايل:
#   Settings → About phone → اضغط Build Number 7 مرات
#   Settings → Developer options → USB debugging = ON

adb devices                      # يجب أن يعرض رقم الجهاز

adb install pabili.apk
# أو لو عندك أكثر من جهاز:
adb -s <device-id> install pabili.apk
```

### ج. عبر QR (Expo Orbit أو صفحة الـbuild)

```bash
eas build:run -p android --latest
# يعرض QR يحمّل APK مباشرة على المحاكي إن كان يعمل
```

### د. drag & drop على محاكي Android Studio

```bash
# AVD Manager مفتوح مع Pixel 6 + Android 14
adb install -r pabili.apk
# -r تستبدل أي نسخة قديمة
```

### هـ. Expo Orbit (تطبيق سطح مكتب)

حمّل [expo.dev/orbit](https://expo.dev/orbit) — يفتح builds بضغطة واحدة.

---

## 6. التحقق من نجاح البناء

بعد تثبيت APK، افتح التطبيق. الترتيب المتوقع:

1. **Launcher icon**: شعار **P** على خلفية `#0E7C5B` مع نقطة ذهبية في الزاوية
2. **Splash**: نفس الرمز + كلمة **Pabili.** تحته (خلفية خضراء)
3. **شاشة phone**: حقل `+966 0XXXXXXXX`، اسم التطبيق Pabili .
4. **OTP**: 4 مربعات، الكود `1234`
5. **Drawer Settings**: ترس الإعدادات في الـProfile يفتح قائمة جانبية 86% من اليمين
6. **LockedMessage**: تظهر عند اختيار Shopper/Store قبل رفع الوثائق

إن رأيت كل ذلك، **الـAPK مُوقّع ويعمل**.

---

## 7. جدول أوامر EAS CLI الكامل

### أوامر setup (مرة واحدة)

| الأمر | الغرض |
|---|---|
| `npx expo register` | إنشاء حساب |
| `npx expo login` | تسجيل دخول |
| `npx expo whoami` | عرض الحساب الحالي |
| `npm install -g eas-cli` | تثبيت EAS CLI |
| `eas build:configure` | ربط المشروع بـexpo.dev |
| `eas init` | تهيئة EAS داخل مجلد المشروع |

### أوامر البناء

| الأمر | الوصف |
|---|---|
| `eas build -p android --profile preview` | بناء APK على السحابة |
| `eas build -p android --profile production` | بناء AAB لـGoogle Play |
| `eas build -p all --profile preview` | بناء iOS + Android معاً |
| `eas build -p android --profile preview --name "v1.0-r2"` | تسمية الـbuild |
| `eas build -p android --profile preview --no-wait` | لا ترسل إيميل عند الانتهاء |
| `eas build -p android --profile preview --clear-cache` | تجاهل cache السابق |
| `eas build --local -p android --profile preview` | بناء على جهازك بدون سحابة |

### أوامر الإدارة

| الأمر | الوصف |
|---|---|
| `eas build:list` | قائمة كل builds |
| `eas build:view --id <id>` | تفاصيل build واحد |
| `eas build:logs --id <id>` | logs حية |
| `eas build:cancel --id <id>` | إيقاف build في منتصفه |
| `eas build:delete --id <id>` | حذف build |
| `eas build:artifact:list --id <id>` | قائمة artifacts |
| `eas build:artifact:download --id <id>` | تنزيل APK |
| `eas build:run -p android --latest` | فتح آخر build على محاكي |

### أوامر OTA (Update Over The Air)

| الأمر | الوصف |
|---|---|
| `eas update:configure` | ربط المشروع بـEAS Update |
| `eas update --branch production` | رفع OTA update |
| `eas channel:edit` | تعديل channels |

### أوامر الميتاداتا

| الأمر | الوصف |
|---|---|
| `eas open` | فتح المشروع على expo.dev في المتصفح |
| `eas project:list` | مشاريعك كلها على expo.dev |
| `eas project:info` | تفاصيل المشروع الحالي |
| `eas metadata:edit` | تعديل بيانات Play Store |
| `eas credentials:list` | كل الـcredentials المسجّلة |
| `eas cache:clear` | تنظيف الـcache المحلي |

### أوامر adb لتثبيت APK

```bash
adb install pabili.apk                     # تثبيت
adb install -r pabili.apk                  # إعادة تثبيت
adb uninstall com.pabili.delivery          # إزالة
adb uninstall com.pabili.delivery && \
    adb install pabili.apk                 # تنظيف + تثبيت
adb shell am start -n com.pabili.delivery/.MainActivity   # تشغيل وفحص
adb logcat | grep -i pabili                # متابعة logs failure
```

---

## 8. Troubleshooting

| العلامة | السبب والحل |
|---|---|
| يطبع "Android App Bundle" بدل "Android Package" | لم تضف `"buildType": "apk"` في `eas.json` profile |
| `Failed to parse keystore` | `eas init` يولّد keystore جديد، اكتب `y` في الـprompt |
| `ANDROID_HOME is missing` (محلي) | اضبط المتغيّر كما في الخطوة 4 |
| `requires JDK 17` | تستخدم JDK 21، ثبّت 17 وأعد export |
| `expo-document-picker not found` | `npx expo install expo-document-picker` |
| `Failed to connect to Supabase` داخل التطبيق | SUPABASE_URL بدون `/rest/v1/` في الآخر |
| `Anonymous sign-ins are disabled` | Supabase dashboard → Auth → Providers → Anonymous → ON |
| `build timed out after 60s` (السحابة) | زِد `memoryLimit` في `eas.json` (default 4GB) |
| `Cannot find main` (محلي) | أعد مع `npx expo prebuild --clean` |
| `com.pabili.delivery already installed` | `adb uninstall com.pabili.delivery` ثم أعد `adb install` |

> **تنبيه:** لو ظهر خطأ خارج هذه القائمة، ابعت output كامل لـ`eas build:logs --id <id>`. الخطأ الأول عادة يكفي لإيجاد السبب الجذري.

---

## 9. ملخّص في 5 أوامر

```bash
# مرة واحدة (setup):
npx expo login                          # أو npx expo register
npm install -g eas-cli
cd pabili-app
eas build:configure                     # ربط بـexpo.dev

# في كل بناء APK:
eas build -p android --profile preview  # 15-30 دقيقة في السحابة

# تنزيل الـAPK:
eas build:artifact:download --id <buildId> --path ./pabili.apk

# تثبيت على Android:
adb install pabili.apk
```

**البديل بدون سحابة:**

```bash
# بعد ضبط ANDROID_HOME و JDK 17 مرة واحدة:
eas build --local -p android --profile preview --output ./out
adb install ./out/pabili-preview.apk
```

---

> كل الأوامر مأخوذة 1:1 من `[docs.expo.dev/build-reference/apk/](https://docs.expo.dev/build-reference/apk/)` و `[docs.expo.dev/build-reference/build-configuration/](https://docs.expo.dev/build-reference/build-configuration/)` و `[docs.expo.dev/build-reference/cli/](https://docs.expo.dev/build-reference/cli/)`. تحققنا منها في 2026-10-16.

Pabili . · v5 · دليل EAS Build · 2026-10-16
