// All direct Firebase SDK usage lives in this one module — everything else
// in the app (models, views, main.js) talks to plain data or to the thin
// wrapper functions exported here, never to the SDK directly. Same modular
// CDN-import pattern RepSprout uses (no bundler), pinned to the same SDK
// version for consistency.

import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig.js';
import {
  initializeApp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot,
  runTransaction, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export { isFirebaseConfigured };

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Correctness (§53) matters more than aggressive offline support — the local
// cache only lets already-synced reads survive a refresh while offline; it
// never lets a stale local write silently win over the server on reconnect,
// since all writes still go through setDoc/runTransaction against the live
// SDK, which reconciles with the server as soon as connectivity returns.
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const googleProvider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function ensureUserProfile(user) {
  await setDoc(doc(db, 'users', user.uid), {
    displayName: user.displayName || user.email || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ── Obligations ──────────────────────────────────────────────────────────
export function subscribeObligations(uid, onData, onError) {
  return onSnapshot(collection(db, 'users', uid, 'obligations'), (snap) => {
    onData(snap.docs.map((d) => d.data()));
  }, onError);
}

export async function saveObligation(uid, obligation) {
  await setDoc(doc(db, 'users', uid, 'obligations', obligation.id), obligation);
}

// Genuine, permanent removal of a master obligation — distinct from "end"
// (§36), which just sets status/endMonth on the same document via
// saveObligation. Historical monthly instances are untouched either way.
export async function deleteObligationPermanently(uid, obligationId) {
  await deleteDoc(doc(db, 'users', uid, 'obligations', obligationId));
}

// ── Monthly instances ────────────────────────────────────────────────────
export function subscribeInstances(uid, onData, onError) {
  return onSnapshot(collection(db, 'users', uid, 'monthlyInstances'), (snap) => {
    onData(snap.docs.map((d) => d.data()));
  }, onError);
}

export async function saveInstance(uid, instance) {
  await setDoc(doc(db, 'users', uid, 'monthlyInstances', instance.id), instance);
}

export async function deleteInstance(uid, instanceId) {
  await deleteDoc(doc(db, 'users', uid, 'monthlyInstances', instanceId));
}

// ── Settings ─────────────────────────────────────────────────────────────
export function subscribeSettings(uid, onData, onError) {
  return onSnapshot(doc(db, 'users', uid, 'settings', 'preferences'), (snap) => {
    onData(snap.exists() ? snap.data() : null);
  }, onError);
}

export async function saveSettings(uid, partialSettings) {
  await setDoc(doc(db, 'users', uid, 'settings', 'preferences'), partialSettings, { merge: true });
}

// ── Export / Backup / Restore (§48, §57 — real, not simulated) ────────────
export async function fetchFullExport(uid) {
  const [obligationsSnap, instancesSnap, settingsSnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'obligations')),
    getDocs(collection(db, 'users', uid, 'monthlyInstances')),
    getDoc(doc(db, 'users', uid, 'settings', 'preferences')),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    obligations: obligationsSnap.docs.map((d) => d.data()),
    monthlyInstances: instancesSnap.docs.map((d) => d.data()),
    settings: settingsSnap.exists() ? settingsSnap.data() : null,
  };
}

// A backup is a real, separate point-in-time copy stored in its own
// Firestore subcollection — distinct from the live obligations/
// monthlyInstances collections a Restore would write back into.
export async function createBackup(uid) {
  const payload = await fetchFullExport(uid);
  const id = payload.exportedAt.replace(/[:.]/g, '-');
  await setDoc(doc(db, 'users', uid, 'backups', id), payload);
  return { id, ...payload };
}

export async function listBackups(uid) {
  const q = query(collection(db, 'users', uid, 'backups'), orderBy('exportedAt', 'desc'), limit(10));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Writes every obligation/instance from the backup back into the live
// collections. This merges the backup's content in — it does not delete
// obligations/instances created after the backup was taken, so it can never
// silently destroy newer data the user doesn't know about.
export async function restoreBackup(uid, backupId) {
  const snap = await getDoc(doc(db, 'users', uid, 'backups', backupId));
  if (!snap.exists()) throw new Error('Backup not found.');
  const { obligations = [], monthlyInstances = [], settings } = snap.data();
  const batch = writeBatch(db);
  for (const o of obligations) batch.set(doc(db, 'users', uid, 'obligations', o.id), o);
  for (const i of monthlyInstances) batch.set(doc(db, 'users', uid, 'monthlyInstances', i.id), i);
  if (settings) batch.set(doc(db, 'users', uid, 'settings', 'preferences'), settings);
  await batch.commit();
  return { obligationsRestored: obligations.length, instancesRestored: monthlyInstances.length };
}

// ── Monthly generation adapter ───────────────────────────────────────────
// Matches the `fs` interface expected by
// js/models/monthlyGeneration.js#generateMonthInFirestore, so that module
// stays free of any direct SDK dependency and is testable with a fake.
export function firestoreGenerationAdapter(uid) {
  return {
    async getActiveObligations() {
      const snap = await getDocs(collection(db, 'users', uid, 'obligations'));
      return snap.docs.map((d) => d.data()).filter((o) => o.status !== 'deleted');
    },
    async getAllInstances() {
      const snap = await getDocs(collection(db, 'users', uid, 'monthlyInstances'));
      return snap.docs.map((d) => d.data());
    },
    async createInstanceIfAbsent(_uid, instanceDoc) {
      const ref = doc(db, 'users', uid, 'monthlyInstances', instanceDoc.id);
      return runTransaction(db, async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists()) return false;
        tx.set(ref, instanceDoc);
        return true;
      });
    },
  };
}
