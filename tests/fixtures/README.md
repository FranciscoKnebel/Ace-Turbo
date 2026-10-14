# Deterministic simulation references

`simulation.json` contains the expected state after 2400 ticks at 120 Hz,
for demo mode, one set and seeds 1, 17 and 99. The replay test compares score,
statistics, player positions/energy and ball positions exactly.

`pre-shared-physics.json` preserves the reference before the physics correction.
It matched the extraction of controller and simulation systems. The shared
predictor deliberately changes AI decisions: it now includes net collisions,
rolling friction and the complete requested sample horizon. The active reference
was regenerated only for this explicit behavior change; the old data remains
available for comparison. Later structural changes must preserve the new one.

Predictor parity tests independently compare the forecast with runtime stepping,
including net/fita, curve, wind and surfaces. Updating a fixture alone does not
validate a physics change.

Codex review corrections refresh this baseline after fixing boundary stamina, tired net approaches and exclusive early doubles volleys. Each seed was replayed twice identically before accepting the snapshot. Regression scenarios remain independent of the snapshot.

A revisão seguinte corrige vigor na linha de serviço e continuidade de saque após tiebreak. Esta referência foi regenerada com duas execuções idênticas por seed; as regressões específicas permanecem independentes do snapshot.

The center gap against two straddling net players is an intentional AI change; this baseline was regenerated with identical double replays per seed.
`input-replay.json` was generated directly from the head of PR 65
(`12757f7449c9314f4034f59ab311867d8a0fa1b1`), not from the complemented
implementation. It stores a versioned human input schedule, seed/options/dt,
final state and every emitted event per tick. The shared replay driver checks
that structural complements preserve the original inputs/events exactly.
