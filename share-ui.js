// =========================================================
// テニス共有 UI (share.js を使って共有バー・モーダルを提供)
// window.TennisShareUI.setup({mode, getState, applyState, container}) で起動
// =========================================================
(function () {
  var state = {
    mode: null,
    sessionCode: null,
    unsubscribe: null,
    getState: null,
    applyState: null,
    isApplyingRemote: false,
    role: "editor",         // 'editor' | 'viewer'
    lastSyncedKey: null,    // 直近同期した state のフィンガープリント (自分の echo を弾く用)
    pushTimer: null
  };

  function whenReady() {
    if (window.TennisShare) return Promise.resolve();
    return new Promise(function (res) {
      window.addEventListener("tennisShareReady", res, { once: true });
    });
  }

  function computeKey(s) {
    return JSON.stringify({
      players: s.players || [],
      matches: s.matches || [],
      scores: s.scores || {}
    });
  }

  async function setup(opts) {
    state.mode = opts.mode;
    state.getState = opts.getState;
    state.applyState = opts.applyState;

    renderShareBar(opts.container);
    await whenReady();

    // URL に ?s=CODE があれば自動 join
    var codeFromUrl = window.TennisShare.getSessionCodeFromUrl();
    if (codeFromUrl) {
      state.sessionCode = codeFromUrl;
      // URL の ?role=editor/viewer を尊重、無ければデフォルト viewer
      var roleFromUrl = new URLSearchParams(window.location.search).get("role");
      var initialRole = (roleFromUrl === "editor") ? "editor" : "viewer";
      setRole(initialRole);
      updateBarUI();
      startSubscription(codeFromUrl);
      if (opts.onAutoJoin) opts.onAutoJoin();
    }
  }

  function renderShareBar(container) {
    if (!container) return;
    if (document.getElementById("shareBar")) return;
    var bar = document.createElement("div");
    bar.className = "share-bar";
    bar.id = "shareBar";
    bar.innerHTML =
      '<div class="share-bar-status">' +
        '<span class="status-dot"></span>' +
        '<span id="shareBarLabel">共有はオフです</span>' +
      "</div>" +
      '<div class="share-bar-controls">' +
        '<button class="share-role-btn" id="shareRoleBtn" style="display:none">🖊️ 編集モード</button>' +
        '<button class="share-btn secondary" id="shareJoinBtn">参加</button>' +
        '<button class="share-btn" id="shareCreateBtn">セッションを作成</button>' +
      "</div>";
    container.appendChild(bar);

    document.getElementById("shareCreateBtn").addEventListener("click", handleCreateClick);
    document.getElementById("shareJoinBtn").addEventListener("click", openJoinModal);
    document.getElementById("shareRoleBtn").addEventListener("click", toggleRole);
  }

  async function handleCreateClick() {
    if (state.sessionCode) {
      openShareModal(state.sessionCode);
      return;
    }
    var st = state.getState();
    if (!st || !st.matches || st.matches.length === 0) {
      alert("先に組み合わせを作成してから共有してください。");
      return;
    }
    try {
      var code = await window.TennisShare.createSession(state.mode, st);
      state.sessionCode = code;
      state.lastSyncedKey = computeKey(st);
      setRole("editor");
      updateBarUI();
      startSubscription(code);
      openShareModal(code);
    } catch (e) {
      alert("セッション作成に失敗しました: " + (e.message || e));
    }
  }

  function startSubscription(code) {
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = window.TennisShare.joinSession(code, function (remote) {
      if (!remote) {
        showToast("セッションが見つかりません: " + code);
        return;
      }
      var key = computeKey(remote);
      // 自分の書き込みの echo なら再描画をスキップ (フォーカス保護)
      if (key === state.lastSyncedKey) return;
      state.lastSyncedKey = key;
      state.isApplyingRemote = true;
      try {
        state.applyState(remote);
      } finally {
        state.isApplyingRemote = false;
      }
    });
  }

  function pushState() {
    if (!state.sessionCode || state.isApplyingRemote) return;
    if (state.role === "viewer") return;
    // 短時間の連続入力をまとめる (Firestore 書き込みコスト削減 & echo を抑制)
    clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(async function () {
      var st = state.getState();
      var pushData = {
        players: st.players,
        matches: st.matches,
        scores: st.scores
      };
      state.lastSyncedKey = computeKey(pushData);
      try {
        await window.TennisShare.updateSession(state.sessionCode, pushData);
      } catch (e) {
        console.error("[TennisShareUI] push failed", e);
        showToast("同期に失敗しました");
      }
    }, 300);
  }

  function setRole(role) {
    state.role = role;
    document.body.classList.toggle("view-only", role === "viewer");
    updateBarUI();
  }

  function toggleRole() {
    setRole(state.role === "editor" ? "viewer" : "editor");
    showToast(state.role === "editor" ? "🖊️ 編集モードに切り替えました" : "👀 閲覧モードに切り替えました");
  }

  function updateBarUI() {
    var bar = document.getElementById("shareBar");
    if (!bar) return;
    var roleBtn = document.getElementById("shareRoleBtn");
    var joinBtn = document.getElementById("shareJoinBtn");
    var createBtn = document.getElementById("shareCreateBtn");

    if (state.sessionCode) {
      bar.classList.add("connected");
      document.getElementById("shareBarLabel").innerHTML =
        '同期中 <span class="share-bar-code">' + state.sessionCode + "</span>";
      createBtn.textContent = "共有情報を表示";
      joinBtn.style.display = "none";
      roleBtn.style.display = "";
      roleBtn.textContent = state.role === "editor" ? "🖊️ 編集モード" : "👀 閲覧モード";
      roleBtn.classList.toggle("viewer", state.role === "viewer");
    } else {
      bar.classList.remove("connected");
      document.getElementById("shareBarLabel").textContent = "共有はオフです";
      createBtn.textContent = "セッションを作成";
      joinBtn.style.display = "";
      roleBtn.style.display = "none";
    }
  }

  function openShareModal(code) {
    var url = window.TennisShare.buildShareUrl(code);
    var modal = document.getElementById("shareModalOverlay") || createShareModal();
    document.getElementById("shareCodeDisplay").textContent = code;
    document.getElementById("shareUrlInput").value = url;
    modal.classList.add("show");
  }

  function createShareModal() {
    var overlay = document.createElement("div");
    overlay.className = "share-modal-overlay";
    overlay.id = "shareModalOverlay";
    overlay.innerHTML =
      '<div class="share-modal">' +
        "<h3>🔗 セッションを共有</h3>" +
        '<p class="share-desc">下のコードまたは URL を共有すると、他の人が同じ画面をリアルタイムで見られます。<br>参加者は初期状態が<b>閲覧モード</b>で、共有バーの「閲覧モード」ボタンから編集モードに切り替えられます。</p>' +
        '<div class="share-code-display" id="shareCodeDisplay"></div>' +
        '<div class="share-url-row">' +
          '<input type="text" id="shareUrlInput" readonly>' +
          '<button id="shareCopyBtn">コピー</button>' +
        "</div>" +
        '<div class="share-modal-actions">' +
          '<button class="close-btn" id="shareCloseBtn">閉じる</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    document.getElementById("shareCopyBtn").addEventListener("click", function () {
      var input = document.getElementById("shareUrlInput");
      input.select();
      var text = input.value;
      var done = function () { showToast("URL をコピーしました"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          document.execCommand("copy");
          done();
        });
      } else {
        document.execCommand("copy");
        done();
      }
    });
    document.getElementById("shareCloseBtn").addEventListener("click", function () {
      overlay.classList.remove("show");
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    return overlay;
  }

  function openJoinModal() {
    var modal = document.getElementById("joinModalOverlay") || createJoinModal();
    document.getElementById("joinCodeInput").value = "";
    document.getElementById("joinError").textContent = "";
    modal.classList.add("show");
    setTimeout(function () { document.getElementById("joinCodeInput").focus(); }, 50);
  }

  function createJoinModal() {
    var overlay = document.createElement("div");
    overlay.className = "join-modal-overlay";
    overlay.id = "joinModalOverlay";
    overlay.innerHTML =
      '<div class="join-modal">' +
        "<h3>セッションに参加</h3>" +
        '<input type="text" id="joinCodeInput" maxlength="6" placeholder="ABC123" autocomplete="off">' +
        '<p class="error" id="joinError"></p>' +
        '<div class="join-role-select">' +
          '<label><input type="radio" name="joinRole" value="viewer" checked> 👀 閲覧のみ</label>' +
          '<label><input type="radio" name="joinRole" value="editor"> 🖊️ 得点入力あり</label>' +
        "</div>" +
        '<div class="share-modal-actions">' +
          '<button class="close-btn" id="joinCloseBtn">キャンセル</button>' +
          '<button class="share-btn" id="joinSubmitBtn">参加</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    var submit = function () {
      var code = document.getElementById("joinCodeInput").value.trim().toUpperCase();
      if (code.length !== 6) {
        document.getElementById("joinError").textContent = "6桁のコードを入力してください。";
        return;
      }
      var role = (document.querySelector('input[name="joinRole"]:checked') || {}).value || "viewer";
      overlay.classList.remove("show");
      var url = new URL(window.location.href);
      url.searchParams.set("s", code);
      url.searchParams.set("role", role);
      window.location.href = url.toString();
    };
    document.getElementById("joinSubmitBtn").addEventListener("click", submit);
    document.getElementById("joinCodeInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
    document.getElementById("joinCloseBtn").addEventListener("click", function () {
      overlay.classList.remove("show");
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("show");
    });
    return overlay;
  }

  function showToast(msg) {
    var toast = document.getElementById("shareToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "share-toast";
      toast.id = "shareToast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  window.TennisShareUI = {
    setup: setup,
    pushState: pushState,
    isRemote: function () { return state.isApplyingRemote; },
    isActive: function () { return !!state.sessionCode; },
    isViewer: function () { return state.role === "viewer"; },
    setRole: setRole
  };
})();
