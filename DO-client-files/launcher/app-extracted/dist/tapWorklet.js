"use strict";
(() => {
  // src/renderer/voice/worklets/tapWorklet.ts
  var TAP_FRAME = 960;
  var TAP_CHANNELS = 2;
  var TapProcessor = class extends AudioWorkletProcessor {
    buf = new Int16Array(TAP_FRAME * TAP_CHANNELS);
    filled = 0;
    // in frames
    process(inputs, outputs) {
      const input = inputs[0];
      const output = outputs[0];
      if (!input || input.length === 0) return true;
      const left = input[0];
      const right = input.length > 1 ? input[1] : input[0];
      if (!left) return true;
      if (output && output[0]) {
        output[0].set(left);
        if (output.length > 1 && output[1]) output[1].set(right);
      }
      for (let i = 0; i < left.length; i++) {
        const l = left[i];
        const r = right[i];
        const li = l > 1 ? 32767 : l < -1 ? -32768 : l * 32767 | 0;
        const ri = r > 1 ? 32767 : r < -1 ? -32768 : r * 32767 | 0;
        this.buf[this.filled * 2] = li;
        this.buf[this.filled * 2 + 1] = ri;
        this.filled++;
        if (this.filled === TAP_FRAME) {
          const out = this.buf.slice();
          this.port.postMessage(out, [out.buffer]);
          this.filled = 0;
        }
      }
      return true;
    }
  };
  registerProcessor("daedric-tap", TapProcessor);
})();
