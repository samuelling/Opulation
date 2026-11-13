# python3 tools/sight-test.py — two phones in one headless Chrome, courting by sight and song: each page's cards are
# fed to the other page's camera (turned head to tail, blurred), and whatever one page sings is fed to the other's ears.
# Needs: pip install playwright; a server on :8765 (python3 -m http.server 8765).
import sys, time, os
SHOT = float(os.environ.get('SHOT', '0')); shot_done = False
from playwright.sync_api import sync_playwright
URL = 'http://localhost:8765/?test'
her_pass, his_pass = (sys.argv[1:3] + ['fig wasp', 'fig wasp'])[:2] if len(sys.argv) > 1 else ('fig wasp', 'fig wasp')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        '--use-file-for-fake-audio-capture=/tmp/silence.wav', '--autoplay-policy=no-user-gesture-required'])
    pages = {}
    for role in ('female', 'male'):
        c = b.new_context(permissions=['microphone', 'camera'], viewport={'width': 420, 'height': 900})
        pg = c.new_page(); pg.on('console', lambda m, r=role: print(f'  [{r}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e, r=role: print(f'  [{r}] PAGE ERROR {e}'))
        pg.goto(URL); pg.wait_for_function('window.__opul')
        pg.click('#modeSight'); pg.click('#roleFemale' if role == 'female' else '#roleMale'); pg.fill('#pass', her_pass if role == 'female' else his_pass)
        pages[role] = pg
    pages['female'].click('#go'); time.sleep(1.5); pages['male'].click('#go')
    t0 = time.time(); last = None; result = 'timeout'
    while time.time() - t0 < 90:
        for a, z in (('female', 'male'), ('male', 'female')):
            url = pages[a].evaluate('__opul.card()')
            if url: pages[z].evaluate('(u) => __opul.see(u)', url)
            for chunk in pages[a].evaluate('__opul.takePlayed()'): pages[z].evaluate('(x) => __opul.hear(x)', chunk)
        st = {r: pages[r].evaluate('__opul.state()') for r in pages}
        line = ' | '.join(f"{r}: {st[r]['stage']} · {st[r]['cap'] or st[r]['air']}" for r in st)
        if line != last: print(f'{time.time() - t0:5.1f}s  {line}'); last = line
        if st['male']['nest'] and st['female']['nest']: result = f"nest open on both: {st['male']['nest']} / {st['female']['nest']}"; break
        if 'kicks' in st['male']['caption'] or 'passphrase' in st['male']['todo']: result = 'he was rejected: ' + st['male']['caption']; break
        if SHOT and not shot_done and time.time() - t0 > SHOT:
            shot_done = True
            for r in pages: pages[r].screenshot(path=f'/tmp/sight-{r}-{SHOT:g}s.png')
        time.sleep(0.12)
    print(f'{time.time() - t0:5.1f}s  RESULT: {result}')
    if 'nest' in result:
        pages['male'].fill('#noteIn', 'a fig, ripe'); pages['male'].click('#noteSend'); time.sleep(1.5)
        print('  she got:', pages['female'].evaluate("[...document.querySelectorAll('#items li.in .bub')].map(e => e.textContent)"))
        pages['male'].screenshot(path='/tmp/sight-male.png', full_page=True); pages['female'].screenshot(path='/tmp/sight-female.png', full_page=True)
    b.close()
