(function () {
  'use strict';

  // ---------- Constants ----------
  const WIN_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  // ---------- State ----------
  // Note: this environment's artifact preview does not support browser
  // localStorage, so scores/history/preferences live in memory for this
  // session. The logic below is written so swapping in real localStorage
  // calls (see the STORAGE_NOTE at the bottom) is a one-line change once
  // this is hosted on a normal site such as GitHub Pages.
  const state = {
    mode: null,              // 'pvp' | 'pvc'
    difficulty: 'easy',      // 'easy' | 'medium' | 'hard'
    playerSymbol: 'X',
    computerSymbol: 'O',
    board: Array(9).fill(null),
    currentPlayer: 'X',
    status: 'menu',          // 'menu' | 'playing' | 'won' | 'draw'
    winner: null,
    winningCombo: null,
    moves: 0,
    scores: { x: 0, o: 0, draws: 0 },
    history: [],
    computerThinking: false
  };

  let gameCounter = 0;

  // ---------- DOM refs ----------
  const modeView = document.getElementById('modeView');
  const gameView = document.getElementById('gameView');
  const modeCards = document.querySelectorAll('.mode-card');
  const pvcOptions = document.getElementById('pvcOptions');
  const symbolBtns = document.querySelectorAll('.symbol-btn');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const startPvcBtn = document.getElementById('startPvcBtn');

  const scoreboard = document.getElementById('scoreboard');
  const scoreLabelX = document.getElementById('scoreLabelX');
  const scoreLabelO = document.getElementById('scoreLabelO');
  const scoreValueX = document.getElementById('scoreValueX');
  const scoreValueO = document.getElementById('scoreValueO');
  const scoreValueDraws = document.getElementById('scoreValueDraws');
  const scoreCellX = document.getElementById('scoreCellX');
  const scoreCellO = document.getElementById('scoreCellO');

  const turnIndicator = document.getElementById('turnIndicator');
  const turnText = document.getElementById('turnText');
  const boardEl = document.getElementById('board');
  const resultOverlay = document.getElementById('resultOverlay');
  const resultMessage = document.getElementById('resultMessage');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const overlayChangeModeBtn = document.getElementById('overlayChangeModeBtn');

  const newGameBtn = document.getElementById('newGameBtn');
  const resetGameBtn = document.getElementById('resetGameBtn');
  const changeModeBtn = document.getElementById('changeModeBtn');
  const resetScoreBtn = document.getElementById('resetScoreBtn');

  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const howToPlayBtn = document.getElementById('howToPlayBtn');
  const howToOverlay = document.getElementById('howToOverlay');
  const howToCloseBtns = howToOverlay.querySelectorAll('[data-close-howto]');

  const confirmScoreOverlay = document.getElementById('confirmScoreOverlay');
  const cancelResetScore = document.getElementById('cancelResetScore');
  const confirmResetScore = document.getElementById('confirmResetScore');

  const liveRegion = document.getElementById('liveRegion');

  let pendingPvcSymbol = 'X';
  let pendingDifficulty = 'easy';
  let selectedModeCard = null;

  // ---------- View switching ----------
  function showView(view) {
    modeView.classList.toggle('active', view === 'mode');
    gameView.classList.toggle('active', view === 'game');
  }

  // ---------- Mode selection ----------
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.getAttribute('data-mode');
      modeCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedModeCard = mode;

      if (mode === 'pvp') {
        pvcOptions.classList.add('hidden');
        beginGame('pvp');
      } else {
        pvcOptions.classList.remove('hidden');
      }
    });
  });

  symbolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      symbolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pendingPvcSymbol = btn.getAttribute('data-symbol');
    });
  });

  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      diffBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pendingDifficulty = btn.getAttribute('data-difficulty');
    });
  });

  startPvcBtn.addEventListener('click', () => {
    state.playerSymbol = pendingPvcSymbol;
    state.computerSymbol = pendingPvcSymbol === 'X' ? 'O' : 'X';
    state.difficulty = pendingDifficulty;
    beginGame('pvc');
  });

  function beginGame(mode) {
    state.mode = mode;
    resetBoardState();
    setupScoreboardLabels();
    showView('game');
    render();

    // If player chose O, computer (X) opens automatically.
    if (mode === 'pvc' && state.computerSymbol === 'X') {
      scheduleComputerMove();
    }
  }

  function setupScoreboardLabels() {
    if (state.mode === 'pvp') {
      scoreLabelX.textContent = 'Player X';
      scoreLabelO.textContent = 'Player O';
    } else {
      scoreLabelX.textContent = state.playerSymbol === 'X' ? 'You' : 'Computer';
      scoreLabelO.textContent = state.playerSymbol === 'O' ? 'You' : 'Computer';
    }
  }

  // ---------- Board / game state helpers ----------
  function resetBoardState() {
    state.board = Array(9).fill(null);
    state.currentPlayer = 'X';
    state.status = 'playing';
    state.winner = null;
    state.winningCombo = null;
    state.moves = 0;
    state.computerThinking = false;
  }

  function getAvailableMoves(board) {
    const moves = [];
    for (let i = 0; i < 9; i++) if (board[i] === null) moves.push(i);
    return moves;
  }

  function checkWinner(board) {
    for (const combo of WIN_COMBOS) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], combo };
      }
    }
    return null;
  }

  function checkDraw(board) {
    return board.every(cell => cell !== null) && !checkWinner(board);
  }

  function switchPlayer() {
    state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
  }

  // ---------- Handling a move ----------
  function handleCellClick(index) {
    if (state.status !== 'playing') return;
    if (state.computerThinking) return;
    if (state.board[index] !== null) return;

    // In PvC mode, block clicks when it isn't the human's turn.
    if (state.mode === 'pvc' && state.currentPlayer !== state.playerSymbol) return;

    placeMark(index, state.currentPlayer);
  }

  function placeMark(index, symbol) {
    state.board[index] = symbol;
    state.moves++;

    const result = checkWinner(state.board);
    if (result) {
      state.status = 'won';
      state.winner = result.winner;
      state.winningCombo = result.combo;
      finishGame();
      return;
    }

    if (checkDraw(state.board)) {
      state.status = 'draw';
      finishGame();
      return;
    }

    switchPlayer();
    render();

    if (state.mode === 'pvc' && state.status === 'playing' && state.currentPlayer === state.computerSymbol) {
      scheduleComputerMove();
    }
  }

  function finishGame() {
    updateScore();
    addHistoryEntry();
    render();
    announceResult();
  }

  // ---------- Computer AI ----------
  function scheduleComputerMove() {
    state.computerThinking = true;
    render();
    setTimeout(() => {
      if (state.status !== 'playing') { state.computerThinking = false; return; }
      const move = getComputerMove();
      state.computerThinking = false;
      if (move !== null && move !== undefined) {
        placeMark(move, state.computerSymbol);
      }
    }, 550);
  }

  function getComputerMove() {
    const available = getAvailableMoves(state.board);
    if (available.length === 0) return null;

    if (state.difficulty === 'easy') {
      return available[Math.floor(Math.random() * available.length)];
    }

    if (state.difficulty === 'medium') {
      // Try to win
      const winMove = findWinningMove(state.board, state.computerSymbol);
      if (winMove !== null) return winMove;
      // Block player
      const blockMove = findWinningMove(state.board, state.playerSymbol);
      if (blockMove !== null) return blockMove;
      // Prefer center, then corners, then edges
      const preferred = [4, 0, 2, 6, 8, 1, 3, 5, 7];
      for (const idx of preferred) if (available.includes(idx)) return idx;
      return available[0];
    }

    // Hard: minimax, unbeatable
    return getBestMove(state.board, state.computerSymbol, state.playerSymbol);
  }

  function findWinningMove(board, symbol) {
    for (const idx of getAvailableMoves(board)) {
      const copy = board.slice();
      copy[idx] = symbol;
      const result = checkWinner(copy);
      if (result && result.winner === symbol) return idx;
    }
    return null;
  }

  function getBestMove(board, aiSymbol, humanSymbol) {
    let bestScore = -Infinity;
    let bestMove = null;
    for (const idx of getAvailableMoves(board)) {
      const copy = board.slice();
      copy[idx] = aiSymbol;
      const score = minimax(copy, 0, false, aiSymbol, humanSymbol);
      if (score > bestScore) {
        bestScore = score;
        bestMove = idx;
      }
    }
    return bestMove;
  }

  function minimax(board, depth, isMaximizing, aiSymbol, humanSymbol) {
    const result = checkWinner(board);
    if (result) {
      if (result.winner === aiSymbol) return 10 - depth;
      return depth - 10;
    }
    if (checkDraw(board)) return 0;

    if (isMaximizing) {
      let best = -Infinity;
      for (const idx of getAvailableMoves(board)) {
        const copy = board.slice();
        copy[idx] = aiSymbol;
        best = Math.max(best, minimax(copy, depth + 1, false, aiSymbol, humanSymbol));
      }
      return best;
    } else {
      let best = Infinity;
      for (const idx of getAvailableMoves(board)) {
        const copy = board.slice();
        copy[idx] = humanSymbol;
        best = Math.min(best, minimax(copy, depth + 1, true, aiSymbol, humanSymbol));
      }
      return best;
    }
  }

  // ---------- Scoring ----------
  function updateScore() {
    if (state.status === 'draw') {
      state.scores.draws++;
      bumpScore('draws');
    } else if (state.status === 'won') {
      if (state.winner === 'X') { state.scores.x++; bumpScore('x'); }
      else { state.scores.o++; bumpScore('o'); }
    }
  }

  function bumpScore(key) {
    const el = key === 'x' ? scoreValueX : key === 'o' ? scoreValueO : scoreValueDraws;
    el.classList.remove('bump');
    void el.offsetWidth; // restart animation
    el.classList.add('bump');
  }

  function resetScore() {
    state.scores = { x: 0, o: 0, draws: 0 };
    render();
  }

  // ---------- History ----------
  function addHistoryEntry() {
    gameCounter++;
    let resultLabel, resultClass;

    if (state.status === 'draw') {
      resultLabel = "Draw";
      resultClass = 'draw';
    } else if (state.mode === 'pvp') {
      resultLabel = `Player ${state.winner} Won`;
      resultClass = 'win';
    } else {
      const playerWon = state.winner === state.playerSymbol;
      resultLabel = playerWon ? 'You Won' : 'Computer Won';
      resultClass = playerWon ? 'win' : 'loss';
    }

    state.history.unshift({
      game: gameCounter,
      mode: state.mode === 'pvp' ? 'Player vs Player' : `vs Computer (${capitalize(state.difficulty)})`,
      result: resultLabel,
      resultClass,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  }

  function clearHistory() {
    state.history = [];
    renderHistory();
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- Rendering ----------
  function render() {
    renderScoreboard();
    renderTurnIndicator();
    renderBoard();
    renderResultOverlay();
    renderHistory();
    updateControlAvailability();
  }

  function renderScoreboard() {
    scoreValueX.textContent = state.scores.x;
    scoreValueO.textContent = state.scores.o;
    scoreValueDraws.textContent = state.scores.draws;
    scoreCellX.classList.toggle('active-x', state.currentPlayer === 'X' && state.status === 'playing');
    scoreCellO.classList.toggle('active-o', state.currentPlayer === 'O' && state.status === 'playing');
  }

  function renderTurnIndicator() {
    turnIndicator.classList.remove('thinking');

    if (state.status === 'won') {
      turnText.textContent = state.mode === 'pvp'
        ? `Player ${state.winner} Wins!`
        : (state.winner === state.playerSymbol ? 'You Win!' : 'Computer Wins!');
      return;
    }
    if (state.status === 'draw') {
      turnText.textContent = "It's a Draw!";
      return;
    }

    if (state.mode === 'pvp') {
      turnText.textContent = `Player ${state.currentPlayer}'s Turn`;
    } else {
      if (state.computerThinking) {
        turnText.textContent = 'Computer is thinking…';
        turnIndicator.classList.add('thinking');
      } else if (state.currentPlayer === state.playerSymbol) {
        turnText.textContent = 'Your Turn';
      } else {
        turnText.textContent = "Computer's Turn";
      }
    }
  }

  function renderBoard() {
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
      const value = state.board[i];
      const row = Math.floor(i / 3) + 1;
      const col = (i % 3) + 1;

      cell.classList.remove('x', 'o', 'win');
      cell.innerHTML = '';

      if (value) {
        cell.classList.add(value.toLowerCase());
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = value;
        cell.appendChild(mark);
      }

      if (state.winningCombo && state.winningCombo.includes(i)) {
        cell.classList.add('win');
      }

      const isDisabled = value !== null
        || state.status !== 'playing'
        || state.computerThinking
        || (state.mode === 'pvc' && state.currentPlayer !== state.playerSymbol);
      cell.disabled = isDisabled;

      cell.setAttribute('aria-label', `Row ${row} Column ${col}, ${value ? value : 'empty'}`);
    });
  }

  function renderResultOverlay() {
    if (state.status === 'won' || state.status === 'draw') {
      let msg;
      if (state.status === 'draw') {
        msg = "It's a Draw!";
      } else if (state.mode === 'pvp') {
        msg = `Player ${state.winner} Wins!`;
      } else {
        msg = state.winner === state.playerSymbol ? 'You Win!' : 'Computer Wins!';
      }
      resultMessage.textContent = msg;
      resultOverlay.classList.remove('hidden');
    } else {
      resultOverlay.classList.add('hidden');
    }
  }

  function renderHistory() {
    historyList.innerHTML = '';
    if (state.history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No completed games yet. Your match history will appear here.';
      historyList.appendChild(empty);
      clearHistoryBtn.disabled = true;
      return;
    }
    clearHistoryBtn.disabled = false;

    state.history.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <span class="history-left">
          <span class="history-mode">${entry.mode}</span>
          <span class="history-game">Game ${entry.game} · ${entry.time}</span>
        </span>
        <span class="history-result ${entry.resultClass}">${entry.result}</span>
      `;
      historyList.appendChild(row);
    });
  }

  function updateControlAvailability() {
    resetScoreBtn.disabled = state.scores.x === 0 && state.scores.o === 0 && state.scores.draws === 0;
  }

  function announceResult() {
    liveRegion.textContent = resultMessage.textContent || turnText.textContent;
  }

  // ---------- Board cell creation ----------
  function buildBoardCells() {
    boardEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement('button');
      btn.className = 'cell';
      btn.type = 'button';
      btn.setAttribute('role', 'gridcell');
      btn.setAttribute('aria-label', 'empty');
      btn.addEventListener('click', () => handleCellClick(i));
      boardEl.appendChild(btn);
    }
  }

  // ---------- Controls ----------
  newGameBtn.addEventListener('click', () => {
    resetBoardState();
    render();
    if (state.mode === 'pvc' && state.computerSymbol === 'X') scheduleComputerMove();
  });

  resetGameBtn.addEventListener('click', () => {
    resetBoardState();
    render();
    if (state.mode === 'pvc' && state.computerSymbol === 'X') scheduleComputerMove();
  });

  changeModeBtn.addEventListener('click', goToModeSelect);
  overlayChangeModeBtn.addEventListener('click', goToModeSelect);
  playAgainBtn.addEventListener('click', () => {
    resetBoardState();
    render();
    if (state.mode === 'pvc' && state.computerSymbol === 'X') scheduleComputerMove();
  });

  function goToModeSelect() {
    state.mode = null;
    modeCards.forEach(c => c.classList.remove('selected'));
    pvcOptions.classList.add('hidden');
    showView('mode');
  }

  resetScoreBtn.addEventListener('click', () => {
    if (resetScoreBtn.disabled) return;
    confirmScoreOverlay.classList.add('open');
  });
  cancelResetScore.addEventListener('click', () => confirmScoreOverlay.classList.remove('open'));
  confirmResetScore.addEventListener('click', () => {
    confirmScoreOverlay.classList.remove('open');
    resetScore();
  });
  confirmScoreOverlay.addEventListener('click', (e) => {
    if (e.target === confirmScoreOverlay) confirmScoreOverlay.classList.remove('open');
  });

  clearHistoryBtn.addEventListener('click', clearHistory);

  // ---------- How to Play modal ----------
  howToPlayBtn.addEventListener('click', () => howToOverlay.classList.add('open'));
  howToCloseBtns.forEach(btn => btn.addEventListener('click', () => howToOverlay.classList.remove('open')));
  howToOverlay.addEventListener('click', (e) => {
    if (e.target === howToOverlay) howToOverlay.classList.remove('open');
  });

  // ---------- Keyboard: Escape closes modals ----------
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      howToOverlay.classList.remove('open');
      confirmScoreOverlay.classList.remove('open');
    }
  });

  // ---------- Init ----------
  buildBoardCells();
  showView('mode');
  render();

  // STORAGE_NOTE: This preview environment blocks browser localStorage, so
  // scores/history reset if the page reloads here. Once you host these files
  // for real (e.g. GitHub Pages), you can persist state across visits by
  // saving on every score/history change and restoring on load, e.g.:
  //   localStorage.setItem('gridclash-scores', JSON.stringify(state.scores));
  //   const saved = localStorage.getItem('gridclash-scores');
  //   if (saved) state.scores = JSON.parse(saved);
})();