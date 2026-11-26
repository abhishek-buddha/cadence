// Synthetic WebSocket audio through the actual component and Chrome AudioContext; no calls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:5173';
assert(['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname));

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.text().includes('Audio WS parse error')) errors.push(message.text()); });
    let socket;
    await page.routeWebSocket(/\/listen\/audio-review$/, ws => { socket = ws; });
    await page.addInitScript(() => {
      const RealAudioContext = window.AudioContext;
      window.audioFrames = [];
      window.stoppedAudio = [];
      window.AudioContext = class extends RealAudioContext {
        constructor() {
          super({ sampleRate: 8000 });
          window.reviewAudioContext = this;
        }
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source);
          const stop = source.stop.bind(source);
          source.stop = (...args) => { window.stoppedAudio.push(source.buffer.getChannelData(0)[0]); stop(...args); };
          source.start = when => {
            window.audioFrames.push({ when, duration: source.buffer.duration, samples: Array.from(source.buffer.getChannelData(0)) });
            start(when);
          };
          return source;
        }
      };
    });
    await page.goto(baseURL);
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: LiveCallMonitor } = await import('/src/components/LiveCallMonitor.jsx');
      const container = document.createElement('div');
      document.body.append(container);
      window.monitorRoot = ReactDOM.createRoot(container);
      window.monitorRoot.render(React.createElement(LiveCallMonitor, {
        call: { _id: 'audio-review', status: 'in_progress', use_case: 'appointment' }, insurance: { name: 'Synthetic audio review' },
      }));
    });
    await page.waitForFunction(() => window.reviewAudioContext?.state === 'running');
    await page.getByText('Live Audio', { exact: true }).waitFor();
    // Over 20 seconds exceeds both the former five-second cap and spread argument limits.
    // The partial final frame must also be played, with every sample preserved in order.
    const bytes = Buffer.alloc(160080);
    for (let i = 0; i < bytes.length; i++) bytes[i] = 128 + Math.floor(i / 320) % 100;
    socket.send(JSON.stringify({ event: 'audio', media: { track: 'outbound', payload: bytes.toString('base64') } }));
    await page.waitForFunction(length => window.audioFrames.reduce((sum, frame) => sum + frame.samples.length, 0) >= length, bytes.length, { timeout: 30000 });
    const frames = await page.evaluate(() => window.audioFrames);
    const expected = Array.from(bytes, value => {
      const code = ~value & 255;
      const magnitude = ((2 * (code & 15) + 33) << ((code >> 4) & 7)) - 33;
      return (code & 128 ? -magnitude : magnitude) / 32768;
    });
    assert.deepEqual(frames.flatMap(frame => frame.samples), expected, 'All agent samples, including the beginning and tail, must survive');
    for (let i = 1; i < frames.length; i++) {
      assert(frames[i].when >= frames[i - 1].when + frames[i - 1].duration - 1e-6, 'Scheduled audio must never overlap');
    }
    const decode = value => {
      const code = ~value & 255;
      return ((code & 128) ? -1 : 1) * (((2 * (code & 15) + 33) << ((code >> 4) & 7)) - 33) / 32768;
    };
    await page.evaluate(() => { window.audioFrames = []; });
    socket.send(JSON.stringify({ event: 'audio', media: { track: 'outbound', payload: Buffer.alloc(64000, 145).toString('base64') } }));
    socket.send(JSON.stringify({ event: 'audio', media: { track: 'inbound', payload: Buffer.alloc(1280, 170).toString('base64') } }));
    await page.waitForFunction(() => window.audioFrames.length >= 4);
    socket.send(JSON.stringify({ event: 'clear', track: 'outbound' }));
    await page.waitForFunction(() => window.stoppedAudio.length > 0);
    const stopped = await page.evaluate(() => window.stoppedAudio);
    assert(stopped.every(sample => sample === decode(145)), 'Interruption must stop agent sources, never patient sources');
    // A new reply must not have eight seconds of interrupted speech in front of it.
    socket.send(JSON.stringify({ event: 'audio', media: { track: 'outbound', payload: Buffer.alloc(320, 205).toString('base64') } }));
    await page.waitForFunction(sample => window.audioFrames.some(frame => frame.samples[0] === sample), decode(205), { timeout: 1500 });
    await page.evaluate(() => window.monitorRoot.unmount());
    assert.deepEqual(errors, []);
    console.log('PASS: full 20-second agent burst, non-overlapping playback, interruption stops only agent audio, fresh reply has no stale backlog');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
