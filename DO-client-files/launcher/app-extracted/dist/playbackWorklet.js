"use strict";
(() => {
  // src/renderer/voice/worklets/playbackWorklet.ts
  var RING_SIZE = 48e3;
  var PRIME_SAMPLES = 2880;
  var MAX_SAMPLES = 11520;
  var FADE = 240;
  var PlaybackProcessor = class extends AudioWorkletProcessor {
    ring = new Float32Array(RING_SIZE);
    readPos = 0;
    writePos = 0;
    buffered = 0;
    primed = false;
    lastSample = 0;
    fadeIn = 0;
    constructor() {
      super();
      this.port.onmessage = (e) => {
        const pcm = e.data;
        if (!(pcm instanceof Float32Array)) return;
        if (this.buffered + pcm.length > MAX_SAMPLES) {
          const drop = Math.floor(this.buffered / 2);
          this.readPos = (this.readPos + drop) % RING_SIZE;
          this.buffered -= drop;
        }
        for (let i = 0; i < pcm.length; i++) {
          this.ring[this.writePos] = pcm[i];
          this.writePos = (this.writePos + 1) % RING_SIZE;
        }
        this.buffered = Math.min(this.buffered + pcm.length, RING_SIZE);
        if (!this.primed && this.buffered >= PRIME_SAMPLES) {
          this.primed = true;
          this.fadeIn = FADE;
        }
      };
    }
    process(_inputs, outputs) {
      const out = outputs[0]?.[0];
      if (!out) return true;
      if (!this.primed || this.buffered === 0) {
        if (this.lastSample !== 0) {
          for (let i = 0; i < out.length; i++) {
            this.lastSample *= 0.9;
            out[i] = this.lastSample;
          }
          if (Math.abs(this.lastSample) < 1e-4) this.lastSample = 0;
        }
        if (this.buffered === 0) this.primed = false;
        return true;
      }
      for (let i = 0; i < out.length; i++) {
        if (this.buffered > 0) {
          let v = this.ring[this.readPos];
          this.readPos = (this.readPos + 1) % RING_SIZE;
          this.buffered--;
          if (this.fadeIn > 0) {
            v *= 1 - this.fadeIn / FADE;
            this.fadeIn--;
          }
          out[i] = v;
          this.lastSample = v;
        } else {
          out[i] = 0;
        }
      }
      return true;
    }
  };
  registerProcessor("daedric-playback", PlaybackProcessor);
})();
