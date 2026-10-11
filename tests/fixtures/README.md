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
