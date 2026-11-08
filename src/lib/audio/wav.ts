import type { Stereo } from "./dsp";

function pcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

export function encodeWavPcm16(src: Stereo): Uint8Array {
  const frames = src.l.length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + frames * 4, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, src.sr, true);
  view.setUint32(28, src.sr * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(offset, pcm16(src.l[i]), true);
    view.setInt16(offset + 2, pcm16(src.r[i]), true);
    offset += 4;
  }
  return new Uint8Array(buffer);
}

export function readWavInfo(data: Uint8Array): {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bits: number;
  dataBytes: number;
  seconds: number;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = String.fromCharCode(data[0], data[1], data[2], data[3]);
  const wave = String.fromCharCode(data[8], data[9], data[10], data[11]);
  if (tag !== "RIFF" || wave !== "WAVE") throw new Error("Not a WAV file");
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  const bytesPerFrame = channels * (bits / 8);
  return {
    audioFormat,
    channels,
    sampleRate,
    bits,
    dataBytes,
    seconds: dataBytes / bytesPerFrame / sampleRate,
  };
}
