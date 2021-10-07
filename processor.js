// https://stackoverflow.com/questions/62702721/how-to-get-microphone-volume-using-audioworklet

const SMOOTHING_FACTOR = 0.8;
const MINIMUM_VALUE = 0.00001;

class MyWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._volume = 0;
    this._updateIntervalInMS = 25;
    this._nextUpdateFrame = this._updateIntervalInMS;
    this.port.onmessage = event => {
      if (event.data.updateIntervalInMS) {
        this._updateIntervalInMS = event.data.updateIntervalInMS
      }
    }
  }

  get intervalInFrames() {
    return this._updateIntervalInMS / 1000 * sampleRate;
  }

  process(inputs, outputs, parameters) {
    // console.log(inputs, outputs, parameters);

    if (inputs.length > 0) {
      const samples = inputs[0][0];
      let sum = 0;
      let rms = 0;

      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
      }

      rms = Math.sqrt(sum / samples.length);

      this._volume = Math.max(rms, this._volume * SMOOTHING_FACTOR);

      this._nextUpdateFrame -= samples.length;
      if (this._nextUpdateFrame < 0) {
        this._nextUpdateFrame += this.intervalInFrames;

        this.port.postMessage({
          volume: rms
        });
      }
    }

    for (const output of outputs) {
      for (let c = 0; c < output.length; c++) {
        const channel = output[c];
        const input = inputs[0][c];
        for (let i = 0; i < channel.length; i++) {
          channel[i] = input[i];
        }
      }
    }

    // console.log(inputs[0], outputs);


    return true;
  }
}

registerProcessor('my-worklet-processor', MyWorkletProcessor);