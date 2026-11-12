// His courtship circuit. FlyWire is a female brain, so it has no male song circuit to load. This is a small
// schematic rate model of the pathway as it is described in the literature, not connectome wiring:
//   seeing her (LC10a) and tasting her pheromone (ppk23 -> vAB3, 7,11-HD) excite P1, the courtship decision hub
//     (Kohatsu & Yamamoto 2015; Clowney et al. 2015);
//   P1 arousal persists for seconds (Jung et al. 2020) and gates pIP10, the descending command for song
//     (von Philipsborn et al. 2011; Clemens et al. 2018);
//   in the ventral nerve cord, dPR1 and vPR6 pattern pulse song, TN1A drives sine song (Shirangi et al. 2016;
//     Lillvis et al. 2024, MANC), and the wing motor neurons sing.
// While he looks at her, LC10a is driven by his optic lobe (js/eye.js, FlyHarp's flyvis model): a stand-in read
// from the OFF and motion activity in the front of his eye, since LC10a itself lies beyond that model.
// The song itself is decided by the key (js/song.js); this circuit shows how a male would produce it.
// Floating point is fine here: nothing about the handshake depends on these numbers.
export const NODES = [
  { id: 'LC10a', label: 'LC10a', area: 'optic lobe', role: 'sees her' },
  { id: 'vAB3', label: 'ppk23→vAB3', area: 'foreleg', role: 'tastes her' },
  { id: 'P1', label: 'P1', area: 'protocerebrum', role: 'decides to court' },
  { id: 'pIP10', label: 'pIP10', area: 'descending', role: 'commands song' },
  { id: 'dPR1', label: 'dPR1', area: 'VNC', role: 'pulse pattern' },
  { id: 'vPR6', label: 'vPR6', area: 'VNC', role: 'pulse timing' },
  { id: 'TN1A', label: 'TN1A', area: 'VNC', role: 'sine song' },
  { id: 'wing', label: 'wing', area: 'VNC', role: 'sings' },
];
export const EDGES = [['LC10a', 'P1'], ['vAB3', 'P1'], ['P1', 'pIP10'], ['pIP10', 'dPR1'], ['pIP10', 'vPR6'], ['pIP10', 'TN1A'], ['dPR1', 'wing'], ['vPR6', 'wing'], ['TN1A', 'wing']];

export class MaleCircuit {
  constructor() { this.a = Object.fromEntries(NODES.map(n => [n.id, 0])); }
  /** dt seconds; sees, tastes: 0..1; pulse: a pulse began this step; hum: sine song now */
  step(dt, { sees = 0, tastes = 0, singing = false, pulse = false, hum = false }) {
    const a = this.a, k = (tau, x, target) => x + (target - x) * Math.min(1, dt / tau);
    a.LC10a = k(0.05, a.LC10a, sees);
    a.vAB3 = k(0.03, a.vAB3, tastes);
    a.P1 = k(1.5, a.P1, Math.min(1, 0.55 * a.LC10a + 1.2 * a.vAB3 + (a.P1 > 0.4 ? 0.5 : 0)));   // slow, self-sustaining arousal
    a.pIP10 = k(0.03, a.pIP10, singing && a.P1 > 0.35 ? 1 : 0);
    a.vPR6 = pulse ? 1 : k(0.006, a.vPR6, 0);
    a.dPR1 = pulse ? 1 : k(0.01, a.dPR1, a.pIP10 * 0.15);
    a.TN1A = k(0.02, a.TN1A, hum && a.pIP10 > 0.5 ? 1 : 0);
    a.wing = Math.min(1, Math.max(a.dPR1, a.vPR6) * 0.9 + a.TN1A * 0.6);
    return a;
  }
}
