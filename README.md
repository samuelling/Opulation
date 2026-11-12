# OPUlation

Two phones may only share a secret once they have courted like fruit flies.

**Play:** https://samuelling.github.io/Opulation/ (GitHub Pages from `main`, root). Use two phones. One chooses *Court* (he sends), the other *Be courted* (she receives), and both type the same passphrase: their species.

## The ritual

| Stage | What the flies do | What the phones do |
|---|---|---|
| **Orient** | He sees her. | Her screen shows her face, a fruit fly's head from the front. Her compound eyes carry her half of a CPace key exchange: each of 520 facets is one bit, Reed-Solomon coded, located by four ink dots (cheek bristles, median ocellus, labellum). His camera reads it. |
| **Tap** | He taps her with a foreleg. | His half of the key exchange, by sound (the [Screech](https://samuelling.github.io/Screech/) modem, 2.3 s). Both phones now hold the same session key, if their passphrases match. |
| **Sing** | He extends one wing and sings: sine song, then four pulse trains. | His key-confirmation tag (16 bytes) *is* the song: 64 inter-pulse intervals of 30, 36, 42 or 48 ms. Played three octaves up for phone speakers; she decodes the intervals and replays the true-pitch song (270 Hz pulses, 155 Hz hum) into her ears. |
| **She decides** | She slows and opens, or kicks and runs. | Her ears are FlyHarp's FlyWire auditory network. Every interval that matches the song she expects lets her song pathway's activity raise her receptivity; every wrong note is a kick. More than four wrong notes and she rejects him. Her acceptance carries her own tag (her pheromone), which he checks. |
| **Mate** | Copulation. | The nest opens: a direct WebRTC link between the phones, for photos, files and notes, both ways, as many as you like. Its connection details (about 90 bytes) go by sound, sealed with the session key, so the link's encryption is bound to the passphrase and nobody can sit in the middle. No server relays anything. If the phones can't reach each other directly (no TURN relay), his first note still goes by sound. |

After a rejection she won't show herself for a while (10 s, doubling up to 10 min): courtship conditioning, and a brake on anyone guessing passphrases.

## Her brain, and his

- **Her ears and song pathway** are [FlyHarp](https://samuelling.github.io/FlyHarp/)'s Tonnectome network: 4,222 neurons and 1.35 M synapses from FlyWire v783 (Johnston's organ, AMMC, saddle, wedge, AVLP and on), with FlyHarp's antenna filterbank and rate dynamics. It is not trained or fit; wiring and transmitter signs are measured, gains and time constants set by hand.
- **OPUlation runs it in integers** (Q16 fixed point, `js/female.js`). Every constant that needs floating point is frozen in `data/female-model.json` by `tools/make-model.mjs`, so two phones, or Swift and JavaScript, compute the same brain bit for bit (`data/vectors.json`).
- **She is individual.** Each neuron's gain varies by up to ±12.5%, drawn from a seed that both phones derive from the session key. So both phones hold the same female only when the passphrases match. His phone runs her too, and shows what she should be feeling while he sings.
- **Her receptivity** reads the mean activity of the 32 cells in the AVLP, PVLP and wedge that respond most to pulse song. vpoEN, the AVLP neuron that responds to song and drives vaginal plate opening in real flies, is in the network and marked. In this untrained model it barely responds, so it is shown but not used.
- **His eye** is FlyHarp's optic lobe: the flyvis connectome-constrained model (Lappalainen et al. 2024; 45,669 neurons, 65 cell types, 721 ommatidia), run in a worker (`js/fly/`, copied from FlyHarp). While his camera reads her face, the same view is sampled onto his 721 facets and drawn as four lenses: photoreceptors, ON (Mi1, Tm3), OFF (Tm1, 2, 4, 9) and T4/T5 motion. His eye resolves about 5° per facet, so the phone camera does the actual reading; his optic lobe shows what a fly makes of the same view. Its frontal OFF and motion activity drives LC10a in his courtship circuit, standing in for the real LC10a, which lies beyond the model.
- **His circuit** is a schematic from the literature, not a connectome. FlyWire is a female brain and has no male song circuits. It has LC10a and ppk23→vAB3 feeding P1, P1 gating pIP10, and pIP10 driving dPR1, vPR6 (pulse) and TN1A (sine). The male nerve cord connectome (MANC) holds the real song circuit; swapping it in is future work.

## Security, honestly

- **The lock is CPace** (draft-irtf-cfrg-cpace-21, ristretto255/SHA-512, on libsodium), checked against the draft's test vectors. Someone who records every sound and photographs her face still can't test passphrases offline. They get one guess per courtship, and she grows wary after each failure.
- **Her face is public by design.** It holds her CPace message, which is safe to show; the seed for her brain is derived only after the exchange.
- **Her song check is a 128-bit tag compared symbol by symbol**, tolerating up to 4 wrong notes out of 64 for a noisy room, which leaves about 100 bits of security. The connectome makes the decision visible. The tag makes it binding.
- Not audited.

## Files

```
index.html  css/opulation.css
js/cpace.js     CPace + key confirmation and derived keys (libsodium)
js/flycode.js   her face: the visual code in her compound eyes (draw + read, Reed-Solomon)
js/protocol.js  the turns: look, tap, accept / kick, sealed link offer/answer, gift; conditioning and mated memory
js/link.js      the nest: compact WebRTC offers/answers (~90 bytes) and file/photo/note transfer
js/song.js      the song: tag <-> intervals, the ideal antenna frames, her listener, on-air render, pulse detector
js/female.js    the FlyWire auditory network in Q16 integers, with a seeded personality
js/male.js      his schematic courtship circuit
js/eye.js       his optic lobe (FlyHarp's flyvis model in js/fly/), fed by the camera
js/modem.js     Screech's modem (copy; accepts frame version 5)
js/app.js       the page
data/           ear.json + ear.bin (from FlyHarp), female-model.json, vectors.json
tools/          make-model.mjs, test*.mjs (npm install; npm test)
```

**Tests:** `npm install && npm test` runs:
- the CPace vectors
- the protocol
- her face under perspective, blur and noise
- her determinism, including train-by-train vs all at once
- agreement between her brain and the crypto over random sessions
- the song through simulated echo
- a full two-phone ritual through camera and room.

`tools/eye-test.html` runs his optic lobe on a synthetic view. `tools/rtc-test.html` connects two WebRTC peers using only the compact blobs and moves a 3 MB file (open it from a local server).

**iPhone:** to come, as a native Swift app that works with the web version. libsodium (swift-sodium) gives the same CPace. The female port must reproduce `data/vectors.json`.
