class AssemblyAIPCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions = options.processorOptions || {};
    this.inputSampleRate =
      processorOptions.inputSampleRate || sampleRate || 24000;
    this.targetSampleRate = processorOptions.targetSampleRate || 24000;
    this.ratio = this.inputSampleRate / this.targetSampleRate;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];

    if (!input) {
      return true;
    }

    const outputLength = Math.max(1, Math.floor(input.length / this.ratio));
    const pcm16 = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sample = input[Math.floor(i * this.ratio)] || 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("assemblyai-pcm-processor", AssemblyAIPCMProcessor);
