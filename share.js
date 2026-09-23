// =========================================================
// テニス共有ライブラリ (Firebase Firestore を使用)
// window.TennisShare にセッション作成/参加 API を公開
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  projectId: "ynable-tennis",
  appId: "1:822812874427:web:922458f1b9a262bd55bb9e",
  storageBucket: "ynable-tennis.firebasestorage.app",
  apiKey: "AIzaSyAwLDcKwcQF8UGIbARtzpLXyP3gJJTZnuU",
  authDomain: "ynable-tennis.firebaseapp.com",
  messagingSenderId: "822812874427"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 6桁の分かりやすいコード生成 (紛らわしい 0,O,1,I を除外)
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * 新しいセッションを作成
 * @param {'singles'|'doubles'|'league'} mode
 * @param {{players:Array, matches:Array, scores:Object, hostName?:string}} state
 * @returns {Promise<string>} セッションコード
 */
async function createSession(mode, state) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = doc(db, "sessions", code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    await setDoc(ref, {
      mode,
      players: state.players || [],
      matches: state.matches || [],
      scores: state.scores || {},
      hostName: state.hostName || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return code;
  }
  throw new Error("セッションコードの生成に失敗しました。もう一度お試しください。");
}

/**
 * セッションに参加してリアルタイムで購読
 * @param {string} code
 * @param {(state:Object|null) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
function joinSession(code, onUpdate) {
  const ref = doc(db, "sessions", code.toUpperCase());
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) onUpdate(snap.data());
    else onUpdate(null);
  }, (err) => {
    console.error("[TennisShare] snapshot error", err);
    onUpdate(null);
  });
}

/**
 * セッション状態を更新
 * @param {string} code
 * @param {Object} patch
 */
async function updateSession(code, patch) {
  const ref = doc(db, "sessions", code.toUpperCase());
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

/** 現在のページ URL に ?s=CODE を付けた共有 URL を返す */
function buildShareUrl(code) {
  const url = new URL(window.location.href);
  url.searchParams.set("s", code.toUpperCase());
  return url.toString();
}

/** URL クエリからセッションコードを取得 (無ければ null) */
function getSessionCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("s");
  return code ? code.toUpperCase() : null;
}

window.TennisShare = {
  createSession,
  joinSession,
  updateSession,
  buildShareUrl,
  getSessionCodeFromUrl
};

// share.js の読み込み完了を通知
window.dispatchEvent(new CustomEvent("tennisShareReady"));
