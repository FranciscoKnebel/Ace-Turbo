export const sideOf = (team) => (team === 'a' ? -1 : 1);
// Referencial da mão: lateral > 0 é forehand (a bola à direita do jogador).
export const handFrame = (team) => (team === 'a' ? 1 : -1);
// Deslocamento para o lado do forehand: a IA não fica na linha da bola, e sim
// um pouco ao lado, para bater de forehand em vez de "no corpo" (neutro).
export const FOREHAND_OFFSET = 0.9;
export const otherTeam = (team) => (team === 'a' ? 'b' : 'a');
export const teamOfSide = (y) => (y < 0 ? 'a' : 'b');

