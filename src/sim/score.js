// Placar oficial de tênis: pontos (0/15/30/40, deuce, AD), games, sets e
// tiebreak. Não conhece física: apenas recebe "time X venceu o ponto".
export class MatchScore {
  constructor({ bestOf = 3, initialServer = 'a', noAd = false, superTiebreak = false } = {}) {
    this.bestOf = bestOf;
    this.setsToWin = Math.ceil(bestOf / 2);
    this.noAd = noAd; // em 40-40 o próximo ponto fecha o game
    this.superTiebreak = superTiebreak; // último set vira tiebreak de 10 pontos
    this.initialServer = initialServer;
    this.sets = []; // sets encerrados: { a, b, tiebreak?: [a,b] }
    this.games = { a: 0, b: 0 };
    this.points = { a: 0, b: 0 };
    this.tiebreak = false;
    this.tbPoints = { a: 0, b: 0 };
    this.tbTarget = 7; // 7 no tiebreak normal, 10 no super tiebreak
    this.tbSuper = false;
    this.tbFirstServer = null;
    this.tbServeBlocks = { a: 0, b: 0 }; // blocos 1-2-2-2 (rotaciona o parceiro)
    this.tbLastServer = null;
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
    if (this.tiebreak || this.noAd) return null;
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
      if (
        this.tbPoints[team] >= this.tbTarget &&
        this.tbPoints[team] - this.tbPoints[other] >= 2
      ) {
        this.games[team] += 1; // fecha o set em 7-6
        this.gamesPlayed += 1;
        this.sets.push({ a: this.games.a, b: this.games.b, tiebreak: { ...this.tbPoints } });
        evs.push({ type: 'set', team, games: { ...this.games } });
        this._endSet(team, evs);
      } else {
        const n = this.tbPoints.a + this.tbPoints.b; // índice do próximo ponto
        const nextServer = this.serviceTeamForPoint(n, this.tbFirstServer);
        // Blocos 1-2-2-2: quando o time que saca muda, começa um bloco novo (nas
        // duplas isso rotaciona o parceiro).
        if (this.tbLastServer && nextServer !== this.tbLastServer) {
          this.tbServeBlocks[nextServer] += 1;
        }
        this.tbLastServer = nextServer;
        this.server = nextServer;
      }
      return evs;
    }

    this.points[team] += 1;
    evs.push({ type: 'point', team });

    if (
      this.points[team] >= 4 &&
      (this.noAd || this.points[team] - this.points[other] >= 2)
    ) {
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
        this.tbTarget = 7;
        this.tbSuper = false;
        this.tbPoints = { a: 0, b: 0 };
        // O bloco 1 usa o PRÓXIMO parceiro da rotação (teamServeIndex conta os
        // games já sacados; +1 avança para quem sacaria o game seguinte).
        this.tbServeBlocks = { a: 1, b: 1 };
        this.tbLastServer = null;
        // Quem saca primeiro no tiebreak é quem sacaria o game seguinte (o
        // rodízio de games gira a cada game).
        this.tbFirstServer = this.other(this.server);
        this.server = this.tbFirstServer;
        evs.push({ type: 'tiebreak', server: this.server });
      } else {
        this._rotateServer();
      }
    }
    return evs;
  }

  _endSet(team, evs) {
    // O tiebreak conta como o game de quem sacou primeiro: o set seguinte
    // começa com o outro time, seguindo a rotação de games.
    const wasTiebreak = this.tiebreak;
    const tbOpener = this.tbFirstServer;
    this.setsWon[team] += 1;
    this.tiebreak = false;
    this.games = { a: 0, b: 0 };
    this.points = { a: 0, b: 0 };
    this.tbPoints = { a: 0, b: 0 };
    this.tbServeBlocks = { a: 0, b: 0 };
    this.tbLastServer = null;
    if (this.setsWon[team] >= this.setsToWin) {
      this.winner = team;
      evs.push({ type: 'match', team });
      return;
    }
    // Rotação de saque para o que vem a seguir: o tiebreak conta como o game de
    // quem sacou primeiro, então o próximo a sacar é o outro time.
    if (wasTiebreak) {
      this.server = this.other(tbOpener);
      this.teamServeIndex[this.server] += 1;
    } else {
      this._rotateServer();
    }
    // Set decisivo vira super tiebreak (10 pontos), já com o sacador rotacionado
    // (mesmo quando o set anterior foi decidido num tiebreak).
    if (
      this.superTiebreak &&
      this.setsWon.a === this.setsToWin - 1 &&
      this.setsWon.b === this.setsToWin - 1
    ) {
      this.tiebreak = true;
      this.tbSuper = true;
      this.tbTarget = 10;
      this.tbPoints = { a: 0, b: 0 };
      this.tbServeBlocks = { a: 1, b: 1 };
      this.tbLastServer = null;
      this.tbFirstServer = this.server;
      evs.push({ type: 'tiebreak', server: this.server, super: true });
    }
  }

  _rotateServer() {
    this.server = this.other(this.server);
    this.teamServeIndex[this.server] += 1;
  }
}
