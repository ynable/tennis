/* ============================================
   テニス ダブルス 組み合わせメーカー - ロジック
   ============================================ */

// --- グローバル変数 ---
let courtCount = 2;
let playerCount = 8;
let players = [];       // プレイヤー名配列
let matches = [];       // 全試合データ [{round, court, team1:[idx,idx], team2:[idx,idx]}]
let scores = {};        // 試合ごとのスコア {matchIndex: {score1: n, score2: n}}
const TOTAL_MATCHES = 30;

// --- ステップ切り替え ---
function showStep(stepId) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

function goToStep1() {
  showStep('step1');
}

// --- Step1 → Step2: バリデーション付き ---
function goToStep2() {
  const courtInput = parseInt(document.getElementById('courtCount').value);
  const playerInput = parseInt(document.getElementById('playerCountInput').value);
  const infoEl = document.getElementById('step1Info');
  const errorEl = document.getElementById('step1Error');

  // リセット
  infoEl.classList.remove('visible');
  infoEl.textContent = '';
  errorEl.classList.remove('visible');
  errorEl.textContent = '';

  // バリデーション
  if (isNaN(courtInput) || courtInput < 1) {
    errorEl.textContent = 'コート数は1以上を入力してください。';
    errorEl.classList.add('visible');
    return;
  }
  if (isNaN(playerInput) || playerInput < 4) {
    errorEl.textContent = '参加人数は4人以上を入力してください。';
    errorEl.classList.add('visible');
    return;
  }
  const maxOnCourt = courtInput * 4;
  if (playerInput < 4) {
    errorEl.textContent = 'ダブルスには最低4人必要です。';
    errorEl.classList.add('visible');
    return;
  }

  courtCount = courtInput;
  playerCount = playerInput;

  // 情報メッセージ
  if (playerCount > maxOnCourt) {
    infoEl.textContent = `ℹ️ ${courtCount}コート(最大${maxOnCourt}人)に対して${playerCount}人です。毎ラウンド${playerCount - maxOnCourt}人が休みになります。`;
    infoEl.classList.add('visible');
  } else if (playerCount < maxOnCourt) {
    // 使用コート数を調整
    const activeCourts = Math.floor(playerCount / 4);
    if (activeCourts < 1) {
      errorEl.textContent = 'ダブルスには最低4人必要です。';
      errorEl.classList.add('visible');
      return;
    }
    infoEl.textContent = `ℹ️ ${playerCount}人なので、実際に使用するコートは${activeCourts}コートになります（${playerCount - activeCourts * 4}人が毎ラウンド休み）。`;
    infoEl.classList.add('visible');
  }

  renderPlayerInputs();
  showStep('step2');
}

function goToStep2FromStep3() {
  showStep('step2');
}

function goToStep3() {
  // プレイヤー名を収集
  players = [];
  for (let i = 0; i < playerCount; i++) {
    const input = document.getElementById(`player-${i}`);
    const name = input.value.trim() || `プレイヤー${i + 1}`;
    players.push(name);
  }
  showStep('step3');
}

// --- プレイヤー入力欄の生成 ---
function renderPlayerInputs() {
  const container = document.getElementById('playerInputs');
  container.innerHTML = '';
  for (let i = 0; i < playerCount; i++) {
    const group = document.createElement('div');
    group.className = 'player-input-group';
    group.innerHTML = `
      <span class="player-number">${i + 1}</span>
      <input type="text" id="player-${i}" placeholder="プレイヤー${i + 1}の名前">
    `;
    container.appendChild(group);
  }
}

// --- 組み合わせ生成 ---
function generateMatches() {
  const firstMatchType = document.querySelector('input[name="firstMatch"]:checked').value;
  matches = [];
  scores = {};

  const totalPlayers = playerCount;
  // 実際に使用できるコート数 = min(指定コート数, floor(人数/4))
  const activeCourts = Math.min(courtCount, Math.floor(totalPlayers / 4));
  const playersPerRound = activeCourts * 4; // 各ラウンドで試合に出る人数

  // ペア回数の追跡: pairCount[i][j] = iとjが同じチームになった回数
  const pairCount = Array.from({ length: totalPlayers }, () => Array(totalPlayers).fill(0));
  // 対戦回数の追跡: oppCount[i][j] = iとjが対戦した回数
  const oppCount = Array.from({ length: totalPlayers }, () => Array(totalPlayers).fill(0));
  // 各プレイヤーの連続出場回数追跡
  const lastPlayedRound = Array(totalPlayers).fill(-2);
  // 各プレイヤーの出場回数
  const playCountArr = Array(totalPlayers).fill(0);

  let matchIndex = 0;
  let roundNumber = 0;

  // 1ラウンドあたりの試合数 = activeCourts
  const matchesPerRound = activeCourts;
  const totalRounds = Math.ceil(TOTAL_MATCHES / matchesPerRound);

  for (let round = 0; round < totalRounds; round++) {
    roundNumber = round + 1;

    let roundPlayers;

    if (round === 0 && firstMatchType === 'sequential') {
      // 初戦: 番号順（playersPerRound人だけ参加）
      roundPlayers = Array.from({ length: playersPerRound }, (_, i) => i);
    } else {
      // プレイヤー選択: 出場回数が少ない人を優先、連続出場を避ける
      roundPlayers = selectPlayersForRound(
        totalPlayers, playersPerRound, lastPlayedRound, round, playCountArr
      );
    }

    // ラウンド参加者から組み合わせを生成
    let roundMatchups;
    if (round === 0 && firstMatchType === 'sequential') {
      // 番号順: [0,1] vs [2,3], [4,5] vs [6,7], ...
      roundMatchups = [];
      for (let c = 0; c < activeCourts; c++) {
        const base = c * 4;
        roundMatchups.push({
          team1: [roundPlayers[base], roundPlayers[base + 1]],
          team2: [roundPlayers[base + 2], roundPlayers[base + 3]],
        });
      }
    } else {
      roundMatchups = assignTeams(roundPlayers, activeCourts, pairCount, oppCount);
    }

    // 記録
    for (const matchup of roundMatchups) {
      if (matchIndex >= TOTAL_MATCHES) break;

      matches.push({
        round: roundNumber,
        court: roundMatchups.indexOf(matchup) + 1,
        team1: matchup.team1,
        team2: matchup.team2,
      });

      // ペア・対戦回数更新
      updatePairCount(pairCount, matchup.team1);
      updatePairCount(pairCount, matchup.team2);
      updateOppCount(oppCount, matchup.team1, matchup.team2);

      // 出場記録更新
      const allInMatch = [...matchup.team1, ...matchup.team2];
      allInMatch.forEach(p => {
        lastPlayedRound[p] = round;
        playCountArr[p]++;
      });

      matchIndex++;
    }

    if (matchIndex >= TOTAL_MATCHES) break;
  }

  renderMatchList();
  showStep('step4');
}

// --- プレイヤー選出ロジック ---
function selectPlayersForRound(totalPlayers, needed, lastPlayedRound, currentRound, playCountArr) {
  const indices = Array.from({ length: totalPlayers }, (_, i) => i);

  // まずシャッフルしてランダム性を確保（同スコア時のタイブレーク）
  shuffleArray(indices);

  // 各プレイヤーにスコアを付けてソート
  // スコアが低いほど優先的に選出
  indices.sort((a, b) => {
    // 1. 出場回数が少ない人を優先
    const countDiff = playCountArr[a] - playCountArr[b];
    if (countDiff !== 0) return countDiff;

    // 2. 最後にプレイしてからの間隔が長い人を優先（休みが続いてる人）
    const aGap = currentRound - lastPlayedRound[a];
    const bGap = currentRound - lastPlayedRound[b];
    if (aGap !== bGap) return bGap - aGap; // 間隔が大きい方を優先

    // 3. 同条件ならシャッフル済みの順序を維持（ランダム）
    return 0;
  });

  return indices.slice(0, needed);
}

// --- チーム割り当てロジック（同ペア最小化） ---
function assignTeams(roundPlayers, courts, pairCount, oppCount) {
  // roundPlayers をシャッフル（基本ランダム性確保）
  const shuffled = [...roundPlayers];
  shuffleArray(shuffled);

  // 最良の組み合わせを探索（複数回試行）
  let bestMatchups = null;
  let bestScore = Infinity;

  const attempts = 50;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = [...shuffled];
    shuffleArray(candidate);

    const matchups = [];
    let totalScore = 0;

    for (let c = 0; c < courts; c++) {
      const base = c * 4;
      const p1 = candidate[base];
      const p2 = candidate[base + 1];
      const p3 = candidate[base + 2];
      const p4 = candidate[base + 3];

      // ペアスコア（同ペア回数の合計を最小にしたい）
      const pairScore = pairCount[p1][p2] + pairCount[p3][p4];
      // 対戦スコア（同対戦回数の合計も考慮）
      const oppScore = oppCount[p1][p3] + oppCount[p1][p4] +
                        oppCount[p2][p3] + oppCount[p2][p4];
      totalScore += pairScore * 3 + oppScore;

      matchups.push({
        team1: [p1, p2],
        team2: [p3, p4],
      });
    }

    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestMatchups = matchups;
    }
  }

  return bestMatchups;
}

// --- ユーティリティ ---
function updatePairCount(pairCount, team) {
  pairCount[team[0]][team[1]]++;
  pairCount[team[1]][team[0]]++;
}

function updateOppCount(oppCount, team1, team2) {
  for (const a of team1) {
    for (const b of team2) {
      oppCount[a][b]++;
      oppCount[b][a]++;
    }
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// --- 試合一覧の描画 ---
function renderMatchList() {
  const container = document.getElementById('matchList');
  container.innerHTML = '';

  let currentRound = 0;

  matches.forEach((match, idx) => {
    // ラウンドヘッダー
    if (match.round !== currentRound) {
      currentRound = match.round;
      const roundHeader = document.createElement('div');
      roundHeader.className = 'match-round-header';
      roundHeader.textContent = `第${currentRound}ラウンド`;
      container.appendChild(roundHeader);

      // 休みの人を表示
      const playingPlayers = new Set();
      matches.filter(m => m.round === currentRound).forEach(m => {
        m.team1.forEach(p => playingPlayers.add(p));
        m.team2.forEach(p => playingPlayers.add(p));
      });
      const restingPlayers = players.filter((_, i) => !playingPlayers.has(i));
      if (restingPlayers.length > 0) {
        const restCard = document.createElement('div');
        restCard.className = 'rest-card';
        restCard.textContent = `☕ 休み: ${restingPlayers.join(', ')}`;
        container.appendChild(restCard);
      }
    }

    // 試合カード
    const card = document.createElement('div');
    card.className = 'match-card';
    card.id = `match-${idx}`;

    const savedScore = scores[idx];

    card.innerHTML = `
      <div class="match-header">
        <span class="match-number">第${idx + 1}試合</span>
        <span class="court-label">コート ${match.court}</span>
      </div>
      <div class="match-teams">
        <span class="team">${players[match.team1[0]]} ・ ${players[match.team1[1]]}</span>
        <span class="vs">VS</span>
        <span class="team">${players[match.team2[0]]} ・ ${players[match.team2[1]]}</span>
      </div>
      <div class="score-area">
        <input type="number" id="score1-${idx}" placeholder="得点" min="0"
          value="${savedScore ? savedScore.score1 : ''}"
          oninput="onScoreInput(${idx})">
        <span class="score-dash">−</span>
        <input type="number" id="score2-${idx}" placeholder="得点" min="0"
          value="${savedScore ? savedScore.score2 : ''}"
          oninput="onScoreInput(${idx})">
      </div>
    `;

    if (savedScore) {
      card.classList.add('saved');
    }

    container.appendChild(card);
  });

  // 集計ボタン表示エリア
  document.getElementById('aggregateArea').classList.add('visible');
}

// --- スコア入力時の自動処理 ---
function onScoreInput(idx) {
  const s1 = document.getElementById(`score1-${idx}`).value;
  const s2 = document.getElementById(`score2-${idx}`).value;
  const card = document.getElementById(`match-${idx}`);

  if (s1 !== '' && s2 !== '') {
    // 両方入力済み → スコア保存 & カードの色を変更
    scores[idx] = { score1: parseInt(s1), score2: parseInt(s2) };
    card.classList.add('saved');
  } else {
    // 片方でも空欄 → スコア削除 & カードの色を戻す
    delete scores[idx];
    card.classList.remove('saved');
  }
}

// --- 集計 & 結果表示 ---
function showResults() {
  // 各プレイヤーの得失点差を集計
  const stats = players.map((name, idx) => ({
    index: idx,
    name: name,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    diff: 0,
    matchCount: 0,
  }));

  matches.forEach((match, idx) => {
    const score = scores[idx];
    if (!score) return;

    const { score1, score2 } = score;

    // チーム1のメンバー
    match.team1.forEach(p => {
      stats[p].pointsFor += score1;
      stats[p].pointsAgainst += score2;
      stats[p].diff += (score1 - score2);
      stats[p].matchCount++;
      if (score1 > score2) stats[p].wins++;
      else if (score1 < score2) stats[p].losses++;
      else stats[p].draws++;
    });

    // チーム2のメンバー
    match.team2.forEach(p => {
      stats[p].pointsFor += score2;
      stats[p].pointsAgainst += score1;
      stats[p].diff += (score2 - score1);
      stats[p].matchCount++;
      if (score2 > score1) stats[p].wins++;
      else if (score2 < score1) stats[p].losses++;
      else stats[p].draws++;
    });
  });

  // 得失点差で順位付け
  stats.sort((a, b) => {
    if (b.diff !== a.diff) return b.diff - a.diff;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  // ランク付与
  stats.forEach((s, i) => {
    s.rank = i + 1;
  });

  renderResults(stats);
  document.getElementById('aggregateArea').classList.remove('visible');
  showStep('step5');
}

function renderResults(stats) {
  const container = document.getElementById('resultTable');

  let html = `
    <table class="result-table">
      <thead>
        <tr>
          <th>順位</th>
          <th>名前</th>
          <th>試合数</th>
          <th>勝</th>
          <th>敗</th>
          <th>分</th>
          <th>得点</th>
          <th>失点</th>
          <th>得失点差</th>
        </tr>
      </thead>
      <tbody>
  `;

  stats.forEach(s => {
    let rankClass = '';
    let badgeClass = 'other';
    if (s.rank === 1) { rankClass = 'rank-1'; badgeClass = 'gold'; }
    else if (s.rank === 2) { rankClass = 'rank-2'; badgeClass = 'silver'; }
    else if (s.rank === 3) { rankClass = 'rank-3'; badgeClass = 'bronze'; }

    const diffDisplay = s.diff > 0 ? `+${s.diff}` : `${s.diff}`;

    html += `
      <tr class="${rankClass}">
        <td><span class="rank-badge ${badgeClass}">${s.rank}</span></td>
        <td>${s.name}</td>
        <td>${s.matchCount}</td>
        <td>${s.wins}</td>
        <td>${s.losses}</td>
        <td>${s.draws}</td>
        <td>${s.pointsFor}</td>
        <td>${s.pointsAgainst}</td>
        <td>${diffDisplay}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// --- ナビゲーション ---
function backToMatches() {
  document.getElementById('aggregateArea').classList.add('visible');
  showStep('step4');
}

function resetApp() {
  if (!confirm('すべてのデータをリセットしますか？')) return;
  players = [];
  matches = [];
  scores = {};
  document.getElementById('aggregateArea').classList.remove('visible');
  showStep('step1');
}
