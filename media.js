// Pabili PH — real photo pipeline: camera/gallery → resize+compress → Supabase Storage → public URL.
// Replaces the old simulated photos and the old uploadOrderPhoto(), which expected a browser File
// object (does not exist in React Native), duplicated the bucket in the path, and was never called.
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase, SUPABASE_ENABLED } from './supabase';

export const BUCKETS = {
  avatar: 'pabili-avatars',
  store: 'pabili-kyc-store',
  license: 'pabili-kyc-license',
  selfie: 'pabili-kyc-selfie',
  orders: 'pabili-orders',
};

const safe = (s) => String(s || 'anon').replace(/[^0-9a-zA-Z]/g, '') || 'anon';
const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

function askSource(title) {
  return new Promise((resolve) => {
    Alert.alert(title, 'Choose where the photo comes from', [
      { text: '📷 Camera', onPress: () => resolve('camera') },
      { text: '🖼 Gallery', onPress: () => resolve('gallery') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

async function pick(source, square) {
  const opts = {
    mediaTypes: ['images'], quality: 0.7, base64: true, exif: false,
    allowsEditing: !!square, aspect: square ? [1, 1] : undefined,
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is off. Enable it in Settings → Pabili → Camera on your phone.');
    return ImagePicker.launchCameraAsync(opts);
  }
  return ImagePicker.launchImageLibraryAsync(opts);
}

// Shrink to ≤1024px wide JPEG so uploads stay small on weak provincial data. Falls back to the
// picker's own base64 if the manipulator module is unavailable.
async function shrink(asset) {
  try {
    const M = require('expo-image-manipulator');
    const out = await M.manipulateAsync(asset.uri,
      asset.width && asset.width > 1024 ? [{ resize: { width: 1024 } }] : [],
      { compress: 0.7, format: M.SaveFormat.JPEG, base64: true });
    if (out && out.base64) return { uri: out.uri, base64: out.base64 };
  } catch (e) { /* use original */ }
  return { uri: asset.uri, base64: asset.base64 };
}

function explain(err) {
  const m = String((err && err.message) || err || '');
  if (/row-level security|violates|not authorized|403|401/i.test(m))
    return 'Storage refused the upload (policy). Run pabili-sql/setup-04-v16.sql in the Supabase SQL editor, then try again.';
  if (/bucket not found|404/i.test(m))
    return 'Storage bucket is missing. Run pabili-sql/setup-04-v16.sql in the Supabase SQL editor, then try again.';
  if (/network|failed to fetch|timed out|timeout/i.test(m))
    return 'No internet or the connection is too slow. Check your data and try again.';
  return m || 'Unknown upload error.';
}

// Core: pick + upload. Returns { uri, path, ts } or null if the user cancelled. Throws on failure.
export async function captureAndUpload({ bucket, owner, folder = 'photo', square = false, title = 'Add photo' }) {
  if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase is not configured in this build.');
  const source = await askSource(title);
  if (!source) return null;
  const res = await pick(source, square);
  if (!res || res.canceled || !res.assets || !res.assets.length) return null;
  const { uri: localUri, base64 } = await shrink(res.assets[0]);
  if (!base64) throw new Error('Could not read the photo. Try another one.');
  const path = `${folder}/${safe(owner)}/${Date.now()}.jpg`;
  const { error } = await withTimeout(
    supabase.storage.from(bucket).upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false }),
    60000, 'Upload timed out');
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { uri: data.publicUrl, localUri, path, ts: Date.now() };
}

// Order-flow helper: returns the photo object stored on the order, or null (cancelled / failed).
// Failures show an honest Alert — a photo is never attached unless it is really in the cloud.
export async function takeProofPhoto({ kind, owner, bucket = BUCKETS.orders, square = false }) {
  try {
    const up = await captureAndUpload({ bucket, owner, folder: kind, square, title: 'Photo — ' + kind });
    if (!up) return null;
    return { by: 'me', kind, ts: up.ts, uri: up.uri, path: up.path, stamp: new Date().toLocaleString(), uploaded: true };
  } catch (e) {
    Alert.alert('Photo not uploaded', explain(e));
    return null;
  }
}

// Best-effort removal of everything this user uploaded (used by "Delete my account").
export async function purgeMyFiles(owner) {
  if (!SUPABASE_ENABLED || !supabase) return;
  const id = safe(owner);
  const pairs = [['avatar', BUCKETS.avatar], ['license', BUCKETS.license], ['selfie', BUCKETS.selfie], ['permit', BUCKETS.store], ['front', BUCKETS.store],
                 ['product', BUCKETS.orders], ['packed', BUCKETS.orders], ['pickup', BUCKETS.orders], ['delivery', BUCKETS.orders]];
  for (const [folder, bucket] of pairs) {
    try {
      const dir = `${folder}/${id}`;
      const { data } = await supabase.storage.from(bucket).list(dir, { limit: 200 });
      if (data && data.length) await supabase.storage.from(bucket).remove(data.map((f) => `${dir}/${f.name}`));
    } catch (e) { /* best effort */ }
  }
}

// KYC / avatar helper: returns the public URL string, or null.
export async function takeDocPhoto({ kind, owner, bucket, square = false }) {
  const p = await takeProofPhoto({ kind, owner, bucket, square });
  return p ? p.uri : null;
}
