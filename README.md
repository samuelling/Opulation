# OPUlation

Two phones may only share a secret once they have courted like fruit flies.

**Play:** https://samuelling.github.io/Opulation/ (GitHub Pages from `main`, root). Use two phones. One chooses *Court* (he sends), the other *Be courted* (she receives), and both type the same passphrase: their species.

## How to court

1. Two phones, one quiet room, volume up. Both open the page and leave **Sight & song** on.
2. Agree on a passphrase out loud; both type exactly the same.
3. The sender picks **♂ Court**, the receiver **♀ Be courted**.
4. She starts first and allows the camera and microphone. Her face appears at the bottom of her screen. Brightness up.
5. He starts and allows the camera and microphone.
6. Hold the phones screen to screen, head to tail (one upside down, so each front camera sits over the other's fly), about a hand apart, and keep still for about ten seconds.
7. If she accepts, a private chat opens on both: notes, photos, files. Leaving the page ends it; nothing is kept.

**Song only** is the slower fallback: he points his back camera at her face once, then both phones lie face up a foot apart and every turn is sung (about a minute).

These steps live behind the **How to mate** button. A **Now** bar at the top of the ritual says what to do with your phone at each moment, and what to check if something fails.

Each phone shows its own side. His shows a male *Drosophila* performing each step to the female in front of him: walking up (tripod gait), tapping her with a foreleg, extending one wing and vibrating it with the song, licking, mounting (`js/flyart.js`), with his courtship circuit below. Hers shows her FlyWire auditory network responding to everything he sings, live, then the courtship song she judges.

## The ritual

| Stage | What the flies do | What the phones do |
|---|---|---|
| **Orient** | He sees her. | (Song only; for Sight & song, see below.) Her screen shows her face, a fruit fly's head from the front. Her compound eyes carry her half of a CPace key exchange: each of 520 facets is one bit, Reed-Solomon coded, located by four ink dots (cheek bristles, median ocellus, labellum). His camera reads it. |
| **Tap** | He taps her with a foreleg. | His half of the key exchange, sung (7.7 s). Both phones now hold the same session key, if their passphrases match. |
| **Sing** | He extends one wing and sings: sine song, then four pulse trains. | His key-confirmation tag (16 bytes) *is* the song: 64 inter-pulse intervals of 30, 36, 42 or 48 ms. Played three octaves up for phone speakers; she decodes the intervals and replays the true-pitch song (270 Hz pulses, 155 Hz hum) into her ears. |
| **She decides** | She slows and opens, or kicks and runs. | Her ears are FlyHarp's FlyWire auditory network. Every interval that matches the song she expects lets her song pathway's activity raise her receptivity; every wrong note is a kick. More than four wrong notes and she rejects him. Her acceptance carries her own tag (her pheromone), which he checks. |
| **Mate** | Copulation. | The nest opens: a direct WebRTC link between the phones, for photos, files and notes, both ways, as many as you like. Its connection details (about 90 bytes) go by sound, sealed with the session key, so the link's encryption is bound to the passphrase and nobody can sit in the middle. No server relays anything. If the phones can't reach each other directly (no TURN relay), his first note still goes by sound. |

### Sight and song: the dance as a code

In **Sight & song** the slow turns go by sight instead, as a fruit fly's version of a QR code, and only the key song is sung (`js/visual.js`). Each phone plays a loop of cards at the bottom of its screen, four a second, and reads the other's with its front camera:

- **Her eyes** (coarse facets: 18 bytes a card) show her half of the key exchange, then a sign that she has his dance and is listening, then her answer: accept plus the sealed reply for the nest, or a kick.
- **His wing** (his extended wing, magnified, the data in its hair field: 20 bytes a card) carries his tap and the sealed way to their nest. Each card is a pose of his courtship, from real *melanogaster* behaviour: he orients, taps her with a foreleg, extends his left wing, vibrates it (pulse song), circles to her other side, extends his right wing, scissors both wings, licks her genitalia, curls his abdomen. His fly performs each pose on his screen as its card plays.
- Every card is Reed-Solomon checked on its own and carries its place in the message, so the camera can catch them in any order. One extra card is the XOR of the rest, so a card the camera missed is rebuilt instead of waited for. The reader finds the four landmark dots at any rotation and in a mirrored view, so the phones can meet either way up.
- **He sings while he dances**, as real males do: his key song starts the moment he has seen her, in bouts, until her eyes answer. Her phone can't judge a song before it has his tap (it doesn't yet know which song to want), so it keeps every whole bout it hears; once his dance gives her the key, her FlyWire network hears the latest bout again, replayed at double speed from that memory, and judges it. A bout heard only in part is dropped, never stitched to the next. The song stays the proof; sight carries the bulk.

Altogether about eight seconds, against about a minute by sound. It needs both front cameras and a lit screen, and it has been tested between two headless browsers (`tools/sight-test.py`), not yet between two real phones: the best distance may need tuning.

After a rejection she won't show herself for a while (10 s, doubling up to 10 min): courtship conditioning, and a brake on anyone guessing passphrases.

## Fly song all the way through

Every sound turn is courtship song, never a modem screech (`js/flysong.js`). A turn is a sine-song hum, then pulse trains broken by short hums, as a real male alternates them. Each pulse carries four bits: the interval since the last pulse (25, 30, 35 or 40 ms) and the pulse's carrier (250, 300, 350 or 400 Hz, the spread from Pslow to Pfast pulses). Everything is played three octaves up so phone speakers can carry it. Each turn is framed with a length, CRC-8 and CRC-32, rate-½ convolutionally coded and interleaved. A lost pulse is detected and treated as an erasure, an echo is ignored, and a hum re-anchors the timing. That gives about 60 bits/s: his tap is 7.7 s, her acceptance 5 s, the sealed link details 18 s each way. The key song (the 64 intervals that prove his passphrase) stays strictly *melanogaster*: one carrier, 30–48 ms intervals. Real *melanogaster* females don't sing; here her phone answers in song anyway.

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
js/flycode.js   the visual code: her face (fine), her eyes and his wing (coarse); draw + read at any rotation, Reed-Solomon
js/visual.js    messages as loops of cards (with a rebuild card), and the poses of his dance
js/protocol.js  the turns: look, tap, accept / kick, sealed link offer/answer, gift; conditioning and mated memory
js/link.js      the nest: compact WebRTC offers/answers (~90 bytes) and file/photo/note transfer
js/song.js      the song: tag <-> intervals, the ideal antenna frames, her listener, on-air render, pulse detector
js/female.js    the FlyWire auditory network in Q16 integers, with a seeded personality
js/male.js      his schematic courtship circuit
js/eye.js       his optic lobe (FlyHarp's flyvis model in js/fly/), fed by the camera
js/flysong.js   fly song as a data channel: compose, render, streaming decoder
js/modem.js     Screech's modem (copy): its convolutional code and CRCs are reused by the fly song
js/app.js       the page
data/           ear.json + ear.bin (from FlyHarp), female-model.json, vectors.json
tools/          make-model.mjs, test*.mjs (npm install; npm test)
```

**Tests:** `npm install && npm test` runs:
- the CPace vectors
- the protocol
- her face and his wing under perspective, blur, noise, rotation and mirroring; card loops read in any order
- her determinism, including train-by-train vs all at once
- agreement between her brain and the crypto over random sessions
- the song through simulated echo
- full two-phone rituals through camera and room, by song only and by sight and song.

`tools/sight-test.py` runs the real page twice in headless Chrome (playwright) and joins them: each page's cards feed the other's camera, turned head to tail and blurred, and each page's song feeds the other's ears. It runs the ritual until the nest opens and a note crosses.

`tools/eye-test.html` runs his optic lobe on a synthetic view. `tools/rtc-test.html` connects two WebRTC peers using only the compact blobs and moves a 3 MB file (open it from a local server).

**iPhone:** to come, as a native Swift app that works with the web version. libsodium (swift-sodium) gives the same CPace. The female port must reproduce `data/vectors.json`.
