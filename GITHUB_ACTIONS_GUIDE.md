# Pabili — بناء APK من GitHub Actions

الـZyte مجرد workflow `build-apk.yml` لفولدر `.github/workflows/`، يبني APK debug في سيرفرات GitHub ويعيده كـArtifact. كل اللي عليك: ارفع المشروع لـRepo، ضيف 2 secrets، شغّل الـworkflow.

## 1. أنشئ Repo على GitHub

- [github.com/new](https://github.com/new)
- اسم الـrepo: `pabili` (اختياري، أي اسم)
- Visibility: **Public** ولا **Private** (كل واحد يعمل)
- اضغط **Create repository**

## 2. ارفع الملفات للـRepo

### A. من موقع GitHub (الأسهل، لو مش عندك git)
1. من صفحة الـrepo الجديدة، اضغط **uploading an existing file** أو **Add file → Upload files**
2. اسحب كل محتويات مجلد `pabili-app/` الموجودة في الـ`pabili-app.zip` (شوف الجدول تحت)
3. اضغط **Commit changes**

### B. من الـTerminal (لو عندك git)
```bash
cd ~/Downloads
unzip pabili-app.zip       # لو لسه ما فكيتش الـzip
cd pabili-app
git init
git add .
git commit -m "Initial Pabili v5 with APK build workflow"
git branch -M main
git remote add origin https://github.com/<your-user>/pabili.git
git push -u origin main
```

## 3. أضف الـSupabase Secrets (مرة واحدة)

- من صفحة الـrepo على GitHub → **Settings** → **Secrets and variables** → **Actions**
- اضغط **New repository secret**:
  - Name: `SUPABASE_URL`
  - Value: `https://mhnneaixcywmciyioxeo.supabase.co` (نفس الشكل، بدون `/rest/v1/`)
- اضغط **New repository secret** تاني:
  - Name: `SUPABASE_ANON_KEY`
  - Value: المفتاح `anon public` اللي أخذته من Supabase dashboard → Project Settings → API

## 4. شغّل الـWorkflow

- من الـrepo → **Actions** tab
- اختار **Build Pabili APK** من الـsidebar الشمال
- اضغط **Run workflow** → **Run workflow**
- الـbuild هيتّاخد 5-15 دقيقة (أول مرة يحمّل Gradle dependencies ~500 MB، بعدها cached)

## 5. حمّل الـAPK

- لما الـworkflow يخلص (علامة خضراء ✓)، اضغط على اسم الـrun
- انزل لـأسفل لـ**Artifacts** section
- اضغط **pabili-debug-apk** عشان تنزل ملف `app-debug.apk`

## الملفات اللي لازم ترفعها للـRepo (مرتّبة)

| الملف | أهميته |
|---|---|
| `App.js` | كود التطبيق — لازم يعدّي sed لتغيير الـSupabase keys قبل البناء |
| `package.json` + `package-lock.json` | npm deps |
| `app.json` | Expo config |
| `eas.json` | EAS config (اختياري لو مش عايز تستخدم EAS cloud) |
| `babel.config.js` | Babel preset لـExpo |
| `metro.config.js` | Metro bundler config |
| `assets/` (icon.png, splash.png, إلخ) | الأيقونات |
| `.github/workflows/build-apk.yml` | الـworkflow نفسه ← **ده اللي بيخلّي GitHub يبني APK** |
| `.gitignore` | ينسخ بنية الـnode_modules |
| `.easignore` | اختياري |

## ملاحظات

- الـworkflow يبني **debug APK** (مشوق بـdebug keystore تلقائي، مش محتاج signing يدوي). تقدر تثبّته على أي Android مباشرة.
- لو عايز **release APK / AAB** موقّع بـGoogle Play keystore، لازم تضيف keystore في Secrets + تبدّل `assembleDebug` بـ`assembleRelease` في الـworkflow.
- الـworkflow يستخدم `expo prebuild` لتوليد مجلد `android/` تلقائياً قبل البناء، فمش محتاج تضيف مجلد `android/` للـgit.
- **الأمان**: الـsecrets تبقى private دايماً، و`App.js` لا يحفظ المفاتيح — الـCI يستبدلها في وقت البناء.
