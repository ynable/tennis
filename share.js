// =========================================================
// テニス共有ライブラリ (Firebase Firestore を使用)
// window.TennisShare にセッション作成/参加 API を公開
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc, serverTimestamp, runTransaction
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
      allowGuestEdit: false,
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

/**
 * ロビーセッションを作成 (プレーヤー名入力前の参加者待ち状態)
 * @param {'singles'|'doubles'|'league'} mode
 * @param {{expectedCount:number, courtCount:number, hostName?:string}} params
 * @returns {Promise<string>} セッションコード
 */
async function createLobbySession(mode, params) {
  const expected = Math.max(2, Math.min(80, params.expectedCount | 0));
  const players = new Array(expected).fill(null);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const ref = doc(db, "sessions", code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;

    await setDoc(ref, {
      mode,
      players,
      matches: [],
      scores: {},
      expectedCount: expected,
      courtCount: params.courtCount | 0,
      hostName: params.hostName || "",
      allowGuestEdit: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return code;
  }
  throw new Error("セッションコードの生成に失敗しました。もう一度お試しください。");
}

/**
 * ロビーの空きスロットをランダムに確保して名前を入れる。
 * トランザクションで競合を回避。
 * @returns {Promise<number>} 割り当てられたスロットindex (0-based)
 */
async function claimSlot(code, name) {
  const ref = doc(db, "sessions", code.toUpperCase());
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("セッションが見つかりません");
    const data = snap.data();
    if (Array.isArray(data.matches) && data.matches.length > 0) {
      throw new Error("このセッションは既に開始されています");
    }
    const players = (data.players || []).slice();
    const emptyIndices = [];
    for (let i = 0; i < players.length; i++) {
      if (players[i] == null || players[i] === "") emptyIndices.push(i);
    }
    if (emptyIndices.length === 0) throw new Error("定員です");
    const idx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    players[idx] = name;
    tx.update(ref, { players, updatedAt: serverTimestamp() });
    return idx;
  });
}

/** URL クエリからセッションコードを取得 (無ければ null) */
function getSessionCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("s");
  return code ? code.toUpperCase() : null;
}

// -------- オーナー識別 (localStorage) --------
function ownerKey(code) { return "tennis:owner:" + code.toUpperCase(); }

/** 自分がオーナーとして作成したセッションを記録 */
function markOwned(code, mode) {
  try {
    localStorage.setItem(ownerKey(code), JSON.stringify({
      mode: mode,
      at: new Date().toISOString()
    }));
  } catch (e) { /* ignore */ }
}

/** 指定のコードが自分がオーナーとして作ったものか */
function isOwned(code) {
  try {
    return !!localStorage.getItem(ownerKey(code));
  } catch (e) { return false; }
}

/** オーナー記録を削除 */
function clearOwned(code) {
  try { localStorage.removeItem(ownerKey(code)); } catch (e) { /* ignore */ }
}

window.TennisShare = {
  createSession,
  createLobbySession,
  claimSlot,
  joinSession,
  updateSession,
  buildShareUrl,
  getSessionCodeFromUrl,
  markOwned,
  isOwned,
  clearOwned
};

// share.js の読み込み完了を通知
window.dispatchEvent(new CustomEvent("tennisShareReady"));
