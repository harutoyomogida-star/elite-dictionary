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
// ---------- Firebase 初期化 ----------
// ※ 画像はFirebase Storage(要課金設定)を使わず、縮小してFirestoreに直接埋め込む方式にしています。
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("ここに貼り付け");
let app, auth, db;
if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
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

// 画像を縮小してBase64(Data URL)に変換する。Storage不要・無料。
// kind: "icons"(小さめ・正方形寄り) / "images"(本文用・少し大きめ)
async function uploadImage(file, kind) {
  const maxDim = kind === "icons" ? 320 : 900;
  const quality = kind === "icons" ? 0.85 : 0.75;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  // 透過を保ちたいPNGはpng、それ以外はjpegで軽量化
  const isPng = file.type === "image/png";
  return canvas.toDataURL(isPng ? "image/png" : "image/jpeg", quality);
}

// ============================================================
// 内部リンク(項目間リンク)まわりのヘルパー
// ============================================================

// 正規表現の特殊文字をエスケープ
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 「他の項目のタイトル」にマッチする正規表現と、タイトル→IDの対応表を作る
function buildWikiRegex(entries, currentId) {
  const seen = new Map();
  entries
    .filter(e => e.id !== currentId && e.title && e.title.trim().length > 0)
    .map(e => ({ id: e.id, title: e.title.trim() }))
    .sort((a, b) => b.title.length - a.title.length) // 長いタイトルを優先してマッチさせる
    .forEach(t => { if (!seen.has(t.title)) seen.set(t.title, t.id); });
  if (!seen.size) return null;
  const pattern = [...seen.keys()].map(escapeRegExp).join("|");
  return { regex: new RegExp(pattern, "g"), map: seen };
}

// 閲覧モードの本文表示時に、他の項目のタイトルが本文中に出てきたら
// 自動で青いリンクに変換する(保存はされない・表示時のみの変換)
function linkifyEntryContent(containerEl, entries, currentId) {
  const built = buildWikiRegex(entries, currentId);
  if (!built) return;
  const { regex, map } = built;

  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement && node.parentElement.closest("a")) return NodeFilter.FILTER_REJECT; // 既存リンクの中は対象外
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  textNodes.forEach(node => {
    const text = node.nodeValue;
    regex.lastIndex = 0;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
      if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      const a = document.createElement("a");
      a.className = "wiki-link";
      a.href = "#";
      a.dataset.id = map.get(match[0]);
      a.textContent = match[0];
      frag.appendChild(a);
      lastIndex = match.index + match[0].length;
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.parentNode.replaceChild(frag, node);
  });
}

// 編集中の本文(contenteditable)の、指定した位置にHTMLを挿し込む
function insertHtmlAtRange(containerEl, range, html) {
  containerEl.focus();
  const sel = window.getSelection();
  let r = range;
  if (!r || !containerEl.contains(r.startContainer)) {
    if (sel.rangeCount && containerEl.contains(sel.anchorNode)) {
      r = sel.getRangeAt(0);
    } else {
      containerEl.insertAdjacentHTML("beforeend", html);
      return;
    }
  }
  r.deleteContents();
  const frag = r.createContextualFragment(html);
  const lastNode = frag.lastChild;
  r.insertNode(frag);
  if (lastNode) {
    r.setStartAfter(lastNode);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

// 編集モードのリッチテキストツールバーのボタン一覧
const RICH_COMMANDS = [
  { cmd: "bold", label: "B", title: "太字" },
  { cmd: "italic", label: "I", title: "斜体" },
  { cmd: "underline", label: "U", title: "下線" },
  { cmd: "h2", label: "見出し", title: "見出しにする" },
  { cmd: "ul", label: "・リスト", title: "箇条書きリスト" },
  { cmd: "ol", label: "1.リスト", title: "番号リスト" },
  { cmd: "quote", label: "引用", title: "引用ブロック" },
  { cmd: "hr", label: "区切り線", title: "区切り線を挿入" },
  { cmd: "link", label: "外部リンク", title: "外部サイトへのリンクを挿入" },
  { cmd: "wikilink", label: "項目リンク", title: "他の項目へのリンクを挿入" },
];

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

    ${state.editMode ? `
      <div class="rich-toolbar" id="richToolbar">
        ${RICH_COMMANDS.map(c => `<button type="button" class="rt-btn" data-cmd="${c.cmd}" title="${c.title}">${c.label}</button>`).join("")}
        <span class="rt-sep"></span>
        <button type="button" class="rt-btn" data-cmd="undo" title="元に戻す">↺</button>
        <button type="button" class="rt-btn" data-cmd="redo" title="やり直し">↻</button>
      </div>
      <div class="link-picker" id="linkPicker" hidden>
        <input type="text" id="linkPickerSearch" placeholder="リンクしたい項目名で検索…">
        <div class="link-picker-list" id="linkPickerList"></div>
      </div>
    ` : ""}

    <div class="content-body" id="contentBody" contenteditable="${state.editMode}">${entry.content || (state.editMode ? "" : "<em style='color:var(--ink-faint)'>本文はまだありません。編集するから書き始めましょう。</em>")}</div>

    ${state.editMode ? `
      <div class="image-tools-panel" id="imageToolsPanel" hidden>
        <span class="setting-desc">選択中の画像:</span>
        <button type="button" class="btn" data-size="25%">小</button>
        <button type="button" class="btn" data-size="50%">中</button>
        <button type="button" class="btn" data-size="100%">大</button>
        <button type="button" class="btn btn-danger" id="deleteImageBtn">画像を削除</button>
      </div>
    ` : ""}

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

  const contentBody = document.getElementById("contentBody");

  if (state.editMode) {
    // ---- 選択範囲(カーソル位置)の記憶 ----
    let savedRange = null;
    const saveSelection = () => {
      const sel = window.getSelection();
      if (sel.rangeCount && contentBody.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    };
    contentBody.addEventListener("keyup", saveSelection);
    contentBody.addEventListener("mouseup", saveSelection);
    contentBody.addEventListener("focus", saveSelection);

    // ---- アイコン画像変更 ----
    const iconBtn = document.getElementById("iconUploadBtn");
    const iconFile = document.getElementById("iconFileInput");
    iconBtn.addEventListener("click", () => iconFile.click());
    iconFile.addEventListener("change", async () => {
      const file = iconFile.files[0]; if (!file) return;
      showToast("アップロード中…");
      const url = await uploadImage(file, "icons");
      entry.iconURL = url;
      document.getElementById("iconWrap").innerHTML = `<img src="${url}" alt="">`;
      await saveEntry(entry.id, { iconURL: url }, { pushHistory: false });
      showToast("アイコンを更新しました");
    });

    // ---- 本文への画像挿入(カーソル位置に挿す) ----
    const contentBtn = document.getElementById("insertImageBtn");
    const contentFile = document.getElementById("contentFileInput");
    contentBtn.addEventListener("click", () => contentFile.click());
    contentFile.addEventListener("change", async () => {
      const file = contentFile.files[0]; if (!file) return;
      showToast("アップロード中…");
      const url = await uploadImage(file, "images");
      insertHtmlAtRange(contentBody, savedRange, `<img src="${url}" alt="">`);
      saveSelection();
      showToast("画像を挿入しました");
    });

    document.getElementById("saveEntryBtn").addEventListener("click", async () => {
      await commitEdits(entry);
      showToast("保存しました");
      render();
    });

    // ---- リッチテキストツールバー ----
    const linkPicker = document.getElementById("linkPicker");
    const linkPickerSearch = document.getElementById("linkPickerSearch");
    const linkPickerList = document.getElementById("linkPickerList");

    function toggleLinkPicker(show) {
      linkPicker.hidden = !show;
      if (show) {
        linkPickerSearch.value = "";
        renderLinkPickerList("");
        linkPickerSearch.focus();
      }
    }
    function renderLinkPickerList(query) {
      const q = query.trim().toLowerCase();
      const candidates = state.entries
        .filter(e => e.id !== entry.id && (e.title || "").toLowerCase().includes(q))
        .slice(0, 20);
      linkPickerList.innerHTML = candidates.length
        ? candidates.map(e => `<div class="link-picker-item" data-id="${e.id}" data-title="${escapeAttr(e.title || "")}">${escapeHtml(e.title || "無題の項目")}</div>`).join("")
        : `<div class="link-picker-item" style="color:var(--ink-faint);cursor:default;">該当する項目がありません</div>`;
      linkPickerList.querySelectorAll(".link-picker-item[data-id]").forEach(item => {
        item.addEventListener("click", () => {
          const targetId = item.dataset.id;
          const targetTitle = item.dataset.title;
          insertHtmlAtRange(contentBody, savedRange, `<a class="wiki-link" data-id="${targetId}">${escapeHtml(targetTitle)}</a>&nbsp;`);
          saveSelection();
          toggleLinkPicker(false);
        });
      });
    }
    linkPickerSearch.addEventListener("input", () => renderLinkPickerList(linkPickerSearch.value));

    document.querySelectorAll("#richToolbar .rt-btn").forEach(btn => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); // ボタン押下でフォーカス/選択範囲が消えるのを防ぐ
        const cmd = btn.dataset.cmd;
        contentBody.focus();
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        switch (cmd) {
          case "bold": document.execCommand("bold"); break;
          case "italic": document.execCommand("italic"); break;
          case "underline": document.execCommand("underline"); break;
          case "h2": document.execCommand("formatBlock", false, "H2"); break;
          case "ul": document.execCommand("insertUnorderedList"); break;
          case "ol": document.execCommand("insertOrderedList"); break;
          case "quote": document.execCommand("formatBlock", false, "BLOCKQUOTE"); break;
          case "hr": insertHtmlAtRange(contentBody, savedRange, "<hr>"); break;
          case "undo": document.execCommand("undo"); break;
          case "redo": document.execCommand("redo"); break;
          case "link": {
            const url = prompt("リンク先のURLを入力してください(https://…)");
            if (!url) return;
            const sel = window.getSelection();
            const label = sel && sel.toString() ? sel.toString() : url;
            insertHtmlAtRange(contentBody, savedRange, `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`);
            break;
          }
          case "wikilink": {
            toggleLinkPicker(true);
            break;
          }
        }
        saveSelection();
      });
    });

    // ---- 画像の選択・サイズ変更・削除 ----
    const imgPanel = document.getElementById("imageToolsPanel");
    let selectedImage = null;
    contentBody.addEventListener("click", (e) => {
      const img = e.target.closest("img");
      contentBody.querySelectorAll("img.img-selected").forEach(i => i.classList.remove("img-selected"));
      if (img) {
        e.preventDefault();
        selectedImage = img;
        img.classList.add("img-selected");
        imgPanel.hidden = false;
      } else {
        selectedImage = null;
        imgPanel.hidden = true;
      }
    });
    imgPanel.querySelectorAll("button[data-size]").forEach(b => {
      b.addEventListener("click", () => {
        if (!selectedImage) return;
        selectedImage.style.width = b.dataset.size;
        selectedImage.style.height = "auto";
      });
    });
    document.getElementById("deleteImageBtn").addEventListener("click", () => {
      if (!selectedImage) return;
      if (!confirm("この画像を削除しますか?")) return;
      selectedImage.remove();
      selectedImage = null;
      imgPanel.hidden = true;
    });

  } else {
    // ---- 閲覧モード: 他の項目タイトルを自動で青リンク化 ----
    linkifyEntryContent(contentBody, state.entries, entry.id);
    contentBody.addEventListener("click", (e) => {
      const link = e.target.closest("a.wiki-link");
      if (!link || !link.dataset.id) return;
      e.preventDefault();
      state.currentEntryId = link.dataset.id;
      state.editMode = false;
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
