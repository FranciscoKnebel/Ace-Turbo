// Placar oficial de tênis: pontos (0/15/30/40, deuce, AD), games, sets e
// tiebreak. Não conhece física: apenas recebe "time X venceu o ponto".
export class MatchScore {
  constructor({ bestOf = 3, initialServer = 'a' } = {}) {
    this.bestOf = bestOf;
    this.setsToWin = Math.ceil(bestOf / 2);
    this.initialServer = initialServer;
    this.sets = []; // sets encerrados: { a, b, tiebreak?: [a,b] }
    this.games = { a: 0, b: 0 };
    this.points = { a: 0, b: 0 };
    this.tiebreak = false;
    this.tbPoints = { a: 0, b: 0 };
    this.tbFirstServer = null;
    this.setsWon = { a: 0, b: 0 };
    this.server = initialServer;
    this.teamServeIndex = { a: 0, b: 0 }; // quantas vezes cada time já sacou
    this.gamesPlayed = 0; // total de games da partida (para troca de lado)
    this.winner = null;
    this.history = [];
  }

  other(team) {
    return team === 'a' ? 'b' : 'a';
  }

  // Lado do sacador: +1 = lado direito ("deuce"), -1 = lado esquerdo ("ad"),
  // no referencial do próprio sacador.
  serveSideSign(team = this.server) {
    const total = this.tiebreak
      ? this.tbPoints.a + this.tbPoints.b
      : this.points.a + this.points.b;
    const deuce = total % 2 === 0 ? 1 : -1;
    const orientation = team === 'a' ? 1 : -1;
    return deuce * orientation;
  }

  // Time que saca no ponto de índice n (0-based) de um tiebreak.
  serviceTeamForPoint(n, first) {
    if (n <= 0) return first;
    return Math.floor((n + 1) / 2) % 2 === 1 ? this.other(first) : first;
  }

  // Rótulo de exibição do placar do game para um time.
  pointsLabel(team) {
    if (this.tiebreak) return String(this.tbPoints[team]);
    const p = this.points[team];
    const q = this.points[this.other(team)];
    if (p >= 3 && q >= 3) {
      if (p === q) return '40';
      return p > q ? 'AD' : '40';
    }
    return ['0', '15', '30', '40'][p] ?? '40';
  }

  isDeuce() {
    if (this.tiebreak) return false;
    return this.points.a === this.points.b && this.points.a >= 3;
  }

  advantageTeam() {
    if (this.tiebreak) return null;
    const { a, b } = this.points;
    if (a >= 3 && b >= 3 && a !== b) return a > b ? 'a' : 'b';
    return null;
  }

  // Registra um ponto. Devolve a lista de eventos de placar ocorridos:
  //   { type:'point'|'game'|'set'|'match'|'tiebreak', team, ... }
  awardPoint(team) {
    const evs = [];
    if (this.winner) return evs;
    const other = this.other(team);
    this.history.push({ team, tiebreak: this.tiebreak, points: { ...this.points }, tb: { ...this.tbPoints } });

    if (this.tiebreak) {
      this.tbPoints[team] += 1;
      if (this.tbPoints[team] >= 7 && this.tbPoints[team] - this.tbPoints[other] >= 2) {
        this.games[team] += 1; // fecha o set em 7-6
        this.gamesPlayed += 1;
        this.sets.push({ a: this.games.a, b: this.games.b, tiebreak: { ...this.tbPoints } });
        evs.push({ type: 'set', team, games: { ...this.games } });
        this._endSet(team, evs);
      } else {
        const n = this.tbPoints.a + this.tbPoints.b; // índice do próximo ponto
        this.server = this.serviceTeamForPoint(n, this.tbFirstServer);
      }
      return evs;
    }

    this.points[team] += 1;
    evs.push({ type: 'point', team });

    if (this.points[team] >= 4 && this.points[team] - this.points[other] >= 2) {
      this.games[team] += 1;
      this.gamesPlayed += 1;
      this.points = { a: 0, b: 0 };
      evs.push({ type: 'game', team, games: { ...this.games } });

      if (this.games[team] >= 6 && this.games[team] - this.games[other] >= 2) {
        this.sets.push({ a: this.games.a, b: this.games.b });
        evs.push({ type: 'set', team, games: { ...this.games } });
        this._endSet(team, evs);
      } else if (this.games.a === 6 && this.games.b === 6) {
        this.tiebreak = true;
        this.tbPoints = { a: 0, b: 0 };
        this.tbFirstServer = this.server;
        evs.push({ type: 'tiebreak', server: this.server });
      } else {
        this._rotateServer();
      }
    }
    return evs;
  }

  _endSet(team, evs) {
    this.setsWon[team] += 1;
    this.tiebreak = false;
    this.games = { a: 0, b: 0 };
    this.points = { a: 0, b: 0 };
    this.tbPoints = { a: 0, b: 0 };
    if (this.setsWon[team] >= this.setsToWin) {
      this.winner = team;
      evs.push({ type: 'match', team });
    } else {
      this._rotateServer();
    }
  }

  _rotateServer() {
    this.server = this.other(this.server);
    this.teamServeIndex[this.server] += 1;
  }
}
