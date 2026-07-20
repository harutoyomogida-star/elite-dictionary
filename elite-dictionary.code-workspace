// ============================================================
// エリート辞典 — app.js
// バニラJS + Firebase(Auth / Firestore / Storage)。ビルド不要。
// ============================================================

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

// ---------- Firebase 初期化 ----------
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("ここに貼り付け");
let app, auth, db, storage;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

// ---------- グローバル状態 ----------
const state = {
  tab: "dictionary",
  user: null,
  entries: [],
  currentEntryId: null,
  editMode: false,
  historyOpenId: null,
  settings: {
    theme: localStorage.getItem("ed_theme") || "light",
    font: localStorage.getItem("ed_font") || "sans",
  },
};

const viewEl = document.getElementById("view");
const authStatusEl = document.getElementById("authStatus");

applyTheme();

// ---------- タブ切り替え ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.tab = btn.dataset.tab;
    state.currentEntryId = null;
    state.editMode = false;
    render();
  });
});

// ---------- 認証状態の監視 ----------
if (isConfigured) {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    authStatusEl.textContent = user ? (user.displayName || user.email) : "未ログイン";
    if (user) await loadEntries();
    render();
  });
} else {
  authStatusEl.textContent = "Firebase未設定";
}

// ============================================================
// データ読み込み・保存
// ============================================================
function guestKey() { return "ed_guest_entries"; }

async function loadEntries() {
  if (state.user) {
    const q = query(collection(db, "users", state.user.uid, "entries"), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    state.entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    state.entries = JSON.parse(localStorage.getItem(guestKey()) || "[]");
  }
}

function saveGuestEntries() {
  localStorage.setItem(guestKey(), JSON.stringify(state.entries));
}

async function createEntry(title) {
  const base = { title: title || "無題の項目", iconURL: null, content: "", updatedAt: Date.now(), createdAt: Date.now() };
  if (state.user) {
    const docRef = await addDoc(collection(db, "users", state.user.uid, "entries"), {
      ...base, updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
    });
    await loadEntries();
    return docRef.id;
  } else {
    const id = "g_" + Date.now();
    state.entries.unshift({ id, ...base });
    saveGuestEntries();
    return id;
  }
}

async function saveEntry(id, patch, { pushHistory = true } = {}) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  if (state.user) {
    if (pushHistory) {
      await addDoc(collection(db, "users", state.user.uid, "entries", id, "revisions"), {
        title: entry.title, content: entry.content, savedAt: serverTimestamp(),
      });
    }
    await updateDoc(doc(db, "users", state.user.uid, "entries", id), {
      ...patch, updatedAt: serverTimestamp(),
    });
    await loadEntries();
  } else {
    if (pushHistory) {
      entry.history = entry.history || [];
      entry.history.unshift({ title: entry.title, content: entry.content, savedAt: Date.now() });
    }
    Object.assign(entry, patch, { updatedAt: Date.now() });
    saveGuestEntries();
  }
}

async function deleteEntry(id) {
  if (state.user) {
    await deleteDoc(doc(db, "users", state.user.uid, "entries", id));
    await loadEntries();
  } else {
    state.entries = state.entries.filter(e => e.id !== id);
    saveGuestEntries();
  }
}

async function fetchHistory(id) {
  if (state.user) {
    const q = query(collection(db, "users", state.user.uid, "entries", id, "revisions"), orderBy("savedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    const entry = state.entries.find(e => e.id === id);
    return (entry.history || []).map((h, i) => ({ id: String(i), ...h }));
  }
}

async function uploadImage(file, pathPrefix) {
  if (!state.user) {
    // ゲストモードはローカルのみ: Data URL として埋め込む(端末内限定)
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  const path = `users/${state.user.uid}/${pathPrefix}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

// ============================================================
// 描画: ルーター
// ============================================================
function render() {
  if (state.tab === "dictionary") renderDictionary();
  else if (state.tab === "data") renderData();
  else if (state.tab === "account") renderAccount();
  else if (state.tab === "settings") renderSettings();
}

// ---------- 辞典タブ ----------
function renderDictionary() {
  if (state.currentEntryId) return renderEntryDetail(state.currentEntryId);

  const list = state.entries;
  viewEl.innerHTML = `
    <div class="eyebrow">Elite Dictionary</div>
    <div class="section-title">辞典</div>
    <div class="search-row">
      <input type="text" id="searchInput" placeholder="項目を検索…">
    </div>
    <div class="entry-list" id="entryList"></div>
    <button class="fab" id="newEntryBtn" aria-label="新しい項目を作成">＋</button>
  `;

  const listEl = document.getElementById("entryList");
  const renderList = (items) => {
    if (!items.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="glyph">辞</div>まだ項目がありません。右下の＋から最初の項目を作りましょう。</div>`;
      return;
    }
    listEl.innerHTML = items.map(e => `
      <div class="entry-row" data-id="${e.id}">
        <div class="entry-icon">${e.iconURL ? `<img src="${e.iconURL}" alt="">` : (e.title || "?").charAt(0)}</div>
        <div class="entry-meta">
          <div class="entry-title">${escapeHtml(e.title || "無題の項目")}</div>
          <div class="entry-sub">${formatDate(e.updatedAt)} 更新</div>
        </div>
      </div>
    `).join("");
    listEl.querySelectorAll(".entry-row").forEach(row => {
      row.addEventListener("click", () => {
        state.currentEntryId = row.dataset.id;
        state.editMode = false;
        render();
      });
    });
  };
  renderList(list);

  document.getElementById("searchInput").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    renderList(list.filter(en => (en.title || "").toLowerCase().includes(q)));
  });

  document.getElementById("newEntryBtn").addEventListener("click", async () => {
    const id = await createEntry("無題の項目");
    state.currentEntryId = id;
    state.editMode = true;
    render();
  });
}

function renderEntryDetail(id) {
  const entry = state.entries.find(e => e.id === id);
  if (!entry) { state.currentEntryId = null; return render(); }

  viewEl.innerHTML = `
    <button class="btn" id="backBtn">← 一覧へ戻る</button>
    <div class="entry-header" style="margin-top:16px;">
      <div class="entry-icon" id="iconWrap">${entry.iconURL ? `<img src="${entry.iconURL}" alt="">` : (entry.title || "?").charAt(0)}</div>
      <div class="entry-header-main">
        ${state.editMode
          ? `<input type="text" id="titleInput" value="${escapeAttr(entry.title || "")}" style="font-family:var(--font-display);font-size:20px;font-weight:700;">`
          : `<div class="entry-header-title">${escapeHtml(entry.title || "無題の項目")}</div>`
        }
        <div class="entry-sub" style="margin-top:6px;">${formatDate(entry.updatedAt)} 更新</div>
      </div>
    </div>

    <div class="entry-toolbar">
      <span class="mode-pill">${state.editMode ? "✎ 編集モード" : "◎ 閲覧モード"}</span>
      <button class="btn" id="toggleModeBtn">${state.editMode ? "閲覧モードにする" : "編集する"}</button>
      ${state.editMode ? `<button class="btn" id="iconUploadBtn">アイコン画像を変更</button><input type="file" id="iconFileInput" accept="image/*" style="display:none;">` : ""}
      ${state.editMode ? `<button class="btn" id="insertImageBtn">本文に画像を挿入</button><input type="file" id="contentFileInput" accept="image/*" style="display:none;">` : ""}
      ${state.editMode ? `<button class="btn btn-primary" id="saveEntryBtn">保存する</button>` : ""}
      <button class="btn btn-danger" id="deleteEntryBtn">削除</button>
    </div>

    <div class="content-body" id="contentBody" contenteditable="${state.editMode}">${entry.content || (state.editMode ? "" : "<em style='color:var(--ink-faint)'>本文はまだありません。編集するから書き始めましょう。</em>")}</div>

    <div class="history-rail">
      <div class="eyebrow">変更履歴</div>
      <div class="history-list" id="historyList">読み込み中…</div>
    </div>
  `;

  document.getElementById("backBtn").addEventListener("click", () => {
    state.currentEntryId = null; state.editMode = false; render();
  });

  document.getElementById("toggleModeBtn").addEventListener("click", async () => {
    if (state.editMode) {
      await commitEdits(entry);
    }
    state.editMode = !state.editMode;
    render();
  });

  document.getElementById("deleteEntryBtn").addEventListener("click", async () => {
    if (!confirm(`「${entry.title || "無題の項目"}」を削除します。よろしいですか?`)) return;
    await deleteEntry(entry.id);
    state.currentEntryId = null;
    showToast("削除しました");
    render();
  });

  if (state.editMode) {
    const iconBtn = document.getElementById("iconUploadBtn");
    const iconFile = document.getElementById("iconFileInput");
    iconBtn.addEventListener("click", () => iconFile.click());
    iconFile.addEventListener("change", async () => {
      const file = iconFile.files[0]; if (!file) return;
      showToast("アップロード中…");
      const url = await uploadImage(file, "icons");
      entry.iconURL = url;
      document.getElementById("iconWrap").innerHTML = `<img src="${url}" alt="">`;
      showToast("アイコンを更新しました");
    });

    const contentBtn = document.getElementById("insertImageBtn");
    const contentFile = document.getElementById("contentFileInput");
    contentBtn.addEventListener("click", () => contentFile.click());
    contentFile.addEventListener("change", async () => {
      const file = contentFile.files[0]; if (!file) return;
      showToast("アップロード中…");
      const url = await uploadImage(file, "images");
      const body = document.getElementById("contentBody");
      body.innerHTML += `<img src="${url}" alt="">`;
      showToast("画像を挿入しました");
    });

    document.getElementById("saveEntryBtn").addEventListener("click", async () => {
      await commitEdits(entry);
      showToast("保存しました");
      render();
    });
  }

  renderHistory(entry.id);
}

async function commitEdits(entry) {
  const titleInput = document.getElementById("titleInput");
  const body = document.getElementById("contentBody");
  const newTitle = titleInput ? titleInput.value : entry.title;
  const newContent = body ? body.innerHTML : entry.content;
  const changed = newTitle !== entry.title || newContent !== entry.content;
  entry.title = newTitle;
  entry.content = newContent;
  if (changed) {
    await saveEntry(entry.id, { title: newTitle, content: newContent }, { pushHistory: true });
  }
}

async function renderHistory(entryId) {
  const listEl = document.getElementById("historyList");
  const history = await fetchHistory(entryId);
  if (!history.length) {
    listEl.innerHTML = `<div class="history-item is-current"><div class="history-time">現在</div><div class="history-label">最新版(まだ過去の版はありません)</div></div>`;
    return;
  }
  listEl.innerHTML = `<div class="history-item is-current"><div class="history-time">現在</div><div class="history-label">最新版</div></div>` +
    history.map(h => `
      <div class="history-item" data-id="${h.id}">
        <div class="history-time">${formatDate(h.savedAt)}</div>
        <div class="history-label">${escapeHtml(h.title || "無題の項目")}</div>
      </div>
    `).join("");

  listEl.querySelectorAll(".history-item[data-id]").forEach(item => {
    item.addEventListener("click", () => {
      const rev = history.find(h => h.id === item.dataset.id);
      if (!rev) return;
      if (!confirm(`この版(${formatDate(rev.savedAt)})の内容をプレビューします。この版で復元しますか?`)) return;
      restoreRevision(entryId, rev);
    });
  });
}

async function restoreRevision(entryId, rev) {
  await saveEntry(entryId, { title: rev.title, content: rev.content }, { pushHistory: true });
  showToast("過去の版を復元しました");
  render();
}

// ---------- データタブ ----------
function renderData() {
  const count = state.entries.length;
  const lastUpdated = state.entries[0] ? formatDate(state.entries[0].updatedAt) : "—";
  viewEl.innerHTML = `
    <div class="eyebrow">Backup & Storage</div>
    <div class="section-title">データ</div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${count}</div><div class="stat-label">登録項目数</div></div>
      <div class="stat-card"><div class="stat-value">${state.user ? "同期中" : "端末内"}</div><div class="stat-label">保存先</div></div>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="setting-label">最終更新</div>
      <div class="setting-desc">${lastUpdated}</div>
    </div>
    <div class="card" style="display:flex; flex-direction:column; gap:10px;">
      <button class="btn btn-block" id="exportBtn">すべての項目をJSONで書き出す</button>
      <button class="btn btn-block" id="importBtn">JSONファイルから読み込む</button>
      <input type="file" id="importFile" accept="application/json" style="display:none;">
      ${!state.user ? `<div class="setting-desc">現在は端末内のみの保存です。アカウントタブでログインすると、複数の端末で同じ辞典を使えるようになります。</div>` : ""}
    </div>
  `;

  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.entries, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "elite-dictionary-export.json";
    a.click();
  });

  const importFile = document.getElementById("importFile");
  document.getElementById("importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0]; if (!file) return;
    const text = await file.text();
    try {
      const items = JSON.parse(text);
      for (const item of items) {
        const id = await createEntry(item.title);
        await saveEntry(id, { title: item.title, content: item.content, iconURL: item.iconURL || null }, { pushHistory: false });
      }
      showToast(`${items.length}件の項目を読み込みました`);
      render();
    } catch (e) {
      showToast("読み込みに失敗しました。JSON形式を確認してください");
    }
  });
}

// ---------- アカウントタブ ----------
let authMode = "login"; // "login" | "signup"
function renderAccount() {
  if (!isConfigured) {
    viewEl.innerHTML = `
      <div class="eyebrow">Account</div>
      <div class="section-title">アカウント</div>
      <div class="card">Firebaseの設定がまだ済んでいません。README.md の手順に沿って firebase-config.js を設定してください。</div>
    `;
    return;
  }

  if (state.user) {
    viewEl.innerHTML = `
      <div class="eyebrow">Account</div>
      <div class="section-title">アカウント</div>
      <div class="profile-row">
        <div class="profile-avatar">${(state.user.displayName || state.user.email || "?").charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-weight:600;">${escapeHtml(state.user.displayName || "名前未設定")}</div>
          <div class="setting-desc">${escapeHtml(state.user.email || "")}</div>
        </div>
      </div>
      <button class="btn btn-block btn-danger" id="logoutBtn">ログアウト</button>
    `;
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await signOut(auth);
      showToast("ログアウトしました");
    });
    return;
  }

  viewEl.innerHTML = `
    <div class="eyebrow">Account</div>
    <div class="section-title">アカウント</div>
    <div class="card auth-card">
      <div class="setting-label" style="font-size:16px;font-weight:600;">${authMode === "login" ? "ログイン" : "新規登録"}</div>
      ${authMode === "signup" ? `<label>表示名</label><input type="text" id="nameInput" placeholder="例: 山田太郎">` : ""}
      <label>メールアドレス</label>
      <input type="email" id="emailInput" placeholder="you@example.com">
      <label>パスワード</label>
      <input type="password" id="passInput" placeholder="6文字以上">
      <div class="error-text" id="authError" style="display:none;"></div>
      <button class="btn btn-primary btn-block" id="authSubmitBtn" style="margin-top:16px;">${authMode === "login" ? "ログイン" : "登録する"}</button>
      <div class="auth-switch">
        ${authMode === "login" ? `アカウントをお持ちでない方は <a id="switchMode">新規登録</a>` : `すでにアカウントをお持ちの方は <a id="switchMode">ログイン</a>`}
      </div>
    </div>
  `;

  document.getElementById("switchMode").addEventListener("click", () => {
    authMode = authMode === "login" ? "signup" : "login";
    render();
  });

  document.getElementById("authSubmitBtn").addEventListener("click", async () => {
    const email = document.getElementById("emailInput").value.trim();
    const pass = document.getElementById("passInput").value;
    const errEl = document.getElementById("authError");
    errEl.style.display = "none";
    try {
      if (authMode === "signup") {
        const nameInput = document.getElementById("nameInput");
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        if (nameInput.value.trim()) await updateProfile(cred.user, { displayName: nameInput.value.trim() });
        showToast("登録しました");
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
        showToast("ログインしました");
      }
    } catch (e) {
      errEl.textContent = translateAuthError(e.code);
      errEl.style.display = "block";
    }
  });
}

function translateAuthError(code) {
  const map = {
    "auth/email-already-in-use": "このメールアドレスはすでに使われています",
    "auth/invalid-email": "メールアドレスの形式が正しくありません",
    "auth/weak-password": "パスワードは6文字以上にしてください",
    "auth/invalid-credential": "メールアドレスまたはパスワードが違います",
    "auth/user-not-found": "アカウントが見つかりません",
    "auth/wrong-password": "パスワードが違います",
  };
  return map[code] || "エラーが発生しました: " + code;
}

// ---------- 設定タブ ----------
function renderSettings() {
  viewEl.innerHTML = `
    <div class="eyebrow">Preferences</div>
    <div class="section-title">設定</div>

    <div class="card" style="margin-bottom:14px;">
      <div class="setting-label" style="font-weight:600;">テーマ</div>
      <div class="theme-grid">
        <div class="choice-chip" data-theme="light">ライト</div>
        <div class="choice-chip" data-theme="dark">ダーク</div>
        <div class="choice-chip" data-theme="sepia">セピア(紙)</div>
      </div>
    </div>

    <div class="card">
      <div class="setting-label" style="font-weight:600;">本文フォント</div>
      <div class="font-grid">
        <div class="choice-chip" data-font="sans">ゴシック体</div>
        <div class="choice-chip" data-font="serif">明朝体</div>
        <div class="choice-chip" data-font="rounded">丸ゴシック</div>
      </div>
    </div>
  `;

  document.querySelectorAll(".choice-chip[data-theme]").forEach(chip => {
    if (chip.dataset.theme === state.settings.theme) chip.classList.add("is-active");
    chip.addEventListener("click", () => {
      state.settings.theme = chip.dataset.theme;
      localStorage.setItem("ed_theme", state.settings.theme);
      applyTheme();
      renderSettings();
    });
  });
  document.querySelectorAll(".choice-chip[data-font]").forEach(chip => {
    if (chip.dataset.font === state.settings.font) chip.classList.add("is-active");
    chip.addEventListener("click", () => {
      state.settings.font = chip.dataset.font;
      localStorage.setItem("ed_font", state.settings.font);
      applyTheme();
      renderSettings();
    });
  });
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.settings.theme);
  document.documentElement.setAttribute("data-font", state.settings.font);
}

// ============================================================
// ユーティリティ
// ============================================================
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

let toastTimer;
function showToast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

// ---------- 初回描画 ----------
loadEntries().then(render);
