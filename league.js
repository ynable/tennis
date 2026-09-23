/* ============================================
   テニス リーグ戦 - ロジック
   ============================================ */

let playerCount = 4;
let players = [];
let matches = [];
let scores = {};

function showStep(stepId) {
  document.querySelectorAll('.step').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById(stepId).classList.add('active');
}

function goToStep1() { showStep('step1'); }

function goToStep2() {
  var input = parseInt(document.getElementById('playerCountInput').value);
  var errorEl = document.getElementById('step1Error');
  errorEl.classList.remove('visible'); errorEl.textContent = '';

  if (isNaN(input) || input < 2) {
    errorEl.textContent = 'リーグ戦には2人以上必要です。';
    errorEl.classList.add('visible'); return;
  }
  if (input > 16) {
    errorEl.textContent = '16人以下で入力してください。';
    errorEl.classList.add('visible'); return;
  }

  playerCount = input;
  renderPlayerInputs();
  showStep('step2');
}

function renderPlayerInputs() {
  var container = document.getElementById('playerInputs');
  container.innerHTML = '';
  for (var i = 0; i < playerCount; i++) {
    var group = document.createElement('div');
    group.className = 'player-input-group';
    group.innerHTML = '<span class="player-number">' + (i + 1) + '</span><input type="text" id="player-' + i + '" placeholder="プレイヤー' + (i + 1) + 'の名前">';
    container.appendChild(group);
  }
}

function generateLeague() {
  players = [];
  for (var i = 0; i < playerCount; i++) {
    var input = document.getElementById('player-' + i);
    var name = input.value.trim() || ('プレイヤー' + (i + 1));
    players.push(name);
  }

  // 総当たり戦の組み合わせ生成
  matches = [];
  scores = {};
  for (var a = 0; a < players.length; a++) {
    for (var b = a + 1; b < players.length; b++) {
      matches.push({ player1: a, player2: b });
    }
  }

  renderMatchList();
  showStep('step3');
  pushShareState();
}

function renderMatchList() {
  var container = document.getElementById('matchList');
  container.innerHTML = '';

  for (var idx = 0; idx < matches.length; idx++) {
    var match = matches[idx];
    var savedScore = scores[idx];
    var card = document.createElement('div');
    card.className = 'match-card' + (savedScore ? ' completed' : '');
    card.id = 'match-' + idx;
    card.innerHTML =
      '<div class="match-header">' +
        '<span class="match-number">' + (savedScore ? '✅ ' : '') + '第' + (idx + 1) + '試合</span>' +
      '</div>' +
      '<div class="match-teams">' +
        '<span class="team">' + players[match.player1] + '</span>' +
        '<span class="vs">VS</span>' +
        '<span class="team">' + players[match.player2] + '</span>' +
      '</div>' +
      '<div class="score-area">' +
        '<input type="number" id="score1-' + idx + '" placeholder="得点" min="0" value="' + (savedScore ? savedScore.score1 : '') + '" oninput="onScoreInput(' + idx + ')">' +
        '<span class="score-dash">−</span>' +
        '<input type="number" id="score2-' + idx + '" placeholder="得点" min="0" value="' + (savedScore ? savedScore.score2 : '') + '" oninput="onScoreInput(' + idx + ')">' +
      '</div>';
    container.appendChild(card);
  }

  document.getElementById('aggregateArea').classList.add('visible');
}

function onScoreInput(idx) {
  var s1 = document.getElementById('score1-' + idx).value;
  var s2 = document.getElementById('score2-' + idx).value;
  var card = document.getElementById('match-' + idx);
  if (s1 !== '' && s2 !== '') {
    scores[idx] = { score1: parseInt(s1), score2: parseInt(s2) };
    if (card) {
      card.classList.add('completed');
      var numEl = card.querySelector('.match-number');
      if (numEl && numEl.textContent.indexOf('✅') === -1) numEl.textContent = '✅ ' + numEl.textContent;
    }
  } else {
    delete scores[idx];
    if (card) {
      card.classList.remove('completed');
      var numEl2 = card.querySelector('.match-number');
      if (numEl2) numEl2.textContent = numEl2.textContent.replace('✅ ', '');
    }
  }
  pushShareState();
}

function goToStep4() {
  document.getElementById('aggregateArea').classList.remove('visible');
  showStandings();
  showStep('step4');
}

function backToMatches() {
  document.getElementById('aggregateArea').classList.add('visible');
  showStep('step3');
}

function showStandings() {
  var stats = [];
  for (var i = 0; i < players.length; i++) {
    stats.push({ index: i, name: players[i], wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, matchCount: 0 });
  }

  for (var idx = 0; idx < matches.length; idx++) {
    var score = scores[idx];
    if (!score) continue;
    var m = matches[idx];
    var s1 = score.score1, s2 = score.score2;

    stats[m.player1].pointsFor += s1;
    stats[m.player1].pointsAgainst += s2;
    stats[m.player1].diff += (s1 - s2);
    stats[m.player1].matchCount++;

    stats[m.player2].pointsFor += s2;
    stats[m.player2].pointsAgainst += s1;
    stats[m.player2].diff += (s2 - s1);
    stats[m.player2].matchCount++;

    if (s1 > s2) { stats[m.player1].wins++; stats[m.player2].losses++; }
    else if (s2 > s1) { stats[m.player2].wins++; stats[m.player1].losses++; }
    else { stats[m.player1].draws++; stats[m.player2].draws++; }
  }

  stats.sort(function (a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.diff !== a.diff) return b.diff - a.diff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.losses - b.losses;
  });
  for (var r = 0; r < stats.length; r++) stats[r].rank = r + 1;

  renderStandings(stats);
}

function renderStandings(stats) {
  var container = document.getElementById('standingsArea');
  var html = '<table class="result-table"><thead><tr><th>順位</th><th>名前</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>得点</th><th>失点</th><th>得失点差</th></tr></thead><tbody>';

  for (var i = 0; i < stats.length; i++) {
    var s = stats[i];
    var rankClass = '', badgeClass = 'other';
    if (s.rank === 1) { rankClass = 'rank-1'; badgeClass = 'gold'; }
    else if (s.rank === 2) { rankClass = 'rank-2'; badgeClass = 'silver'; }
    else if (s.rank === 3) { rankClass = 'rank-3'; badgeClass = 'bronze'; }
    var diffDisplay = s.diff > 0 ? '+' + s.diff : '' + s.diff;
    html += '<tr class="' + rankClass + '">' +
      '<td><span class="rank-badge ' + badgeClass + '">' + s.rank + '</span></td>' +
      '<td>' + s.name + '</td>' +
      '<td>' + s.matchCount + '</td>' +
      '<td>' + s.wins + '</td>' +
      '<td>' + s.losses + '</td>' +
      '<td>' + s.draws + '</td>' +
      '<td>' + s.pointsFor + '</td>' +
      '<td>' + s.pointsAgainst + '</td>' +
      '<td>' + diffDisplay + '</td>' +
      '</tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

function resetApp() {
  if (!confirm('すべてのデータをリセットしますか？')) return;
  players = []; matches = []; scores = {};
  document.getElementById('aggregateArea').classList.remove('visible');
 

// ==========================================================
// 共有機能 (share-ui.js との統合)
// ==========================================================
function getShareState() {
  return {
    players: players.slice(),
    matches: matches.map(function (m) { return { player1: m.player1, player2: m.player2 }; }),
    scores: Object.assign({}, scores)
  };
}

function applyShareState(remote) {
  if (!remote) return;
  players = (remote.players || []).slice();
  playerCount = players.length;
  matches = (remote.matches || []).map(function (m) {
    return { player1: m.player1, player2: m.player2 };
  });
  scores = {};
  var rs = remote.scores || {};
  Object.keys(rs).forEach(function (k) {
    scores[k] = { score1: rs[k].score1, score2: rs[k].score2 };
  });
  if (matches.length > 0) {
    renderMatchList();
    showStep('step3');
  }
}

function pushShareState() {
  if (window.TennisShareUI && !window.TennisShareUI.isRemote()) {
    window.TennisShareUI.pushState();
  }
}

// 共有セッションを開始 (ロビーモード)
async function startSharedSession() {
  var input = parseInt(document.getElementById('playerCountInput').value);
  var errorEl = document.getElementById('step1Error');
  errorEl.classList.remove('visible'); errorEl.textContent = '';
  if (isNaN(input) || input < 2) {
    errorEl.textContent = 'リーグ戦には2人以上必要です。';
    errorEl.classList.add('visible'); return;
  }
  if (input > 16) {
    errorEl.textContent = '16人以下で入力してください。';
    errorEl.classList.add('visible'); return;
  }
  if (!window.TennisShareUI) {
    alert('共有機能の読み込みに失敗しています。');
    return;
  }
  await window.TennisShareUI.startLobby({
    expectedCount: input,
    courtCount: 0
  });
}

// ロビーから受け取った名前で組み合わせを生成
function generateFromLobbyPlayers(namedPlayers) {
  players = namedPlayers.slice();
  playerCount = players.length;
  matches = [];
  scores = {};
  for (var a = 0; a < players.length; a++) {
    for (var b = a + 1; b < players.length; b++) {
      matches.push({ player1: a, player2: b });
    }
  }
  renderMatchList();
  showStep('step3');
  pushShareState();
}

(function initShare() {
  if (!window.TennisShareUI) return;
  var container = document.querySelector('.container');
  if (!container) return;
  var anchor = container.querySelector('.league-lead') || container.querySelector('h1');
  var shareContainer = document.createElement('div');
  anchor.parentNode.insertBefore(shareContainer, anchor.nextSibling);
  window.TennisShareUI.setup({
    mode: 'league',
    getState: getShareState,
    applyState: applyShareState,
    container: shareContainer,
    onGenerate: function (namedPlayers) {
      generateFromLobbyPlayers(namedPlayers);
    }
  });
})(); showStep('step1');
}
