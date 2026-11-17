"use strict";
(() => {
  // src/renderer/voice/worklets/captureWorklet.ts
  var FRAME = 960;
  var TARGET_RMS = 0.08;
  var GAIN_MIN = 0.5;
  var GAIN_MAX = 4;
  var GAIN_SMOOTH = 0.05;
  var CaptureProcessor = class extends AudioWorkletProcessor {
    buf = new Float32Array(FRAME);
    filled = 0;
    ptt = false;
    normGain = 1;
    constructor() {
      super();
      this.port.onmessage = (e) => {
        if (e.data?.t === "ptt") {
          const down = !!e.data.down;
          if (this.ptt && !down) this.filled = 0;
          this.ptt = down;
        }
      };
    }
    process(inputs) {
      const ch = inputs[0]?.[0];
      if (!ch || !this.ptt) return true;
      let offset = 0;
      while (offset < ch.length) {
        const take = Math.min(FRAME - this.filled, ch.length - offset);
        this.buf.set(ch.subarray(offset, offset + take), this.filled);
        this.filled += take;
        offset += take;
        if (this.filled === FRAME) {
          let sum = 0;
          let peak = 0;
          for (let i = 0; i < FRAME; i++) {
            const s = this.buf[i];
            sum += s * s;
            const a = s < 0 ? -s : s;
            if (a > peak) peak = a;
          }
          const rms = Math.sqrt(sum / FRAME);
          if (rms > 4e-3) {
            const ideal = Math.min(GAIN_MAX, Math.max(GAIN_MIN, TARGET_RMS / rms));
            this.normGain += (ideal - this.normGain) * GAIN_SMOOTH;
          }
          let g = this.normGain;
          if (peak * g > 0.95) g = 0.95 / peak;
          const out = new Float32Array(FRAME);
          for (let i = 0; i < FRAME; i++) {
            const v = this.buf[i] * g;
            out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
          }
          this.port.postMessage(out, [out.buffer]);
          this.filled = 0;
        }
      }
      return true;
    }
  };
  registerProcessor("daedric-capture", CaptureProcessor);
})();
