class MyWorkletNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'my-worklet-processor');
  }
}

const app = new Vue({
  el: '#app',
  data() {
    return {
      message: 'Helo Vue',
      inputDevices: [],
      outputDevices: [],
      inputId: 'default',
      outputId: 'default',
      stream: undefined,

      started: false,
      state: { context: null, source: null, node: null, oscillator: null, amp: null, audio: null },
      volume: 0,

      i: 0,
      volumes: [],
      messages: [],
      diffs: [],

      baseline: 0,

      startTime: 0,
      resolveTone: null,
    }
  },
  computed: {
    inputDevice() {
      return this.inputDevices.find(device => device.deviceId === this.inputId);
    },
    outputDevice() {
      return this.outputDevices.find(device => device.deviceId === this.outputId);
    },
    latency() {
      let average = 0;
      for (const diff of this.diffs) {
        average += diff;
      }
      return average / this.diffs.length;
    }
  },
  methods: {
    async start() {
      await this.getUserMedia();

      this.volumes = [];
      this.i = 0;
      this.messages = [];
      this.diffs = [];
      console.log('wow!');

      this.started = true;
      console.log(this.inputDevice);

      const context = new AudioContext();
      
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 600;
      const amp = context.createGain();
      amp.gain.value = 0;

      oscillator.connect(amp);
      oscillator.start(0);

      await context.audioWorklet.addModule('processor.js')

      const source = context.createMediaStreamSource(this.stream);
      const dest = context.createMediaStreamDestination(this.stream);

      const audio = new Audio();

      amp.connect(dest);

      console.log(dest.stream);
      audio.srcObject = dest.stream;
      audio.setSinkId(this.outputId);
      audio.play();

      const node = new MyWorkletNode(context);

      source.connect(node);

      // node.port.addEventListener('message', this.processAudio.bind(this));
      node.port.onmessage = this.processAudio.bind(this);

      this.state.context = context;
      this.state.source = source;
      this.state.node = node;
      this.state.oscillator = oscillator;
      this.state.amp = amp;

      console.log(context, source, node);

      await this.findBaseline();
      await this.performTest();
    },
    stop() {
      this.started = false;

      this.state.context.suspend();
    },

    waitForTone(t) {
      return new Promise(res => {
        let resolved = false;
        this.resolveTone = function() {
          if (!resolved) {
            resolved = true;
            res(Date.now());
          }
        }
        
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            res(false);
          }
        }, t);
      });
    },

    sleep(t = 1000) {
      return new Promise(res => setTimeout(res, t));
    },

    async findBaseline() {
      this.messages.push('Finding baseline. Please be quiet.');
      await this.sleep(5000);
      const values = this.volumes.slice(0);

      this.baseline = Math.max(...values) * 2;

      this.messages[0] = 'The baseline is: ' + this.baseline;
    },

    async performTest() {
      await this.sleep(1000);

      while (this.started) {
        if (!this.started) return;

        this.playTone();
        const end = await this.waitForTone(1000);
        if (end === false) {
          this.messages.push('Timed out.');
        } else {
          const diff = end - this.startTime;
          this.diffs.push(diff);
          if (this.diffs.length > 8) {
            this.diffs.shift();
          }

          this.messages.push('Read in ' + diff + 'ms');
        }

        this.stopTone();
        await this.sleep(1000);

      }
    },

    playTone() {
      this.startTime = Date.now();

      this.state.amp.gain.value = 1;
    },

    stopTone() {
      this.state.amp.gain.value = 0;
    },

    processAudio(e) {
      this.volume = e.data.volume;

      this.volumes[this.i] = e.data.volume;

      if (++this.i >= 1000) {
        this.i = 0;
      }

      if (this.startTime !== 0 && this.baseline !== 0) {
        if (e.data.volume > this.baseline) {
          this.resolveTone();
        }
      }
    },

    processDevices(deviceInfo) {
      console.log(deviceInfo);
      const input = [];
      const output = [];
      for (const device of deviceInfo) {
        if (device.kind === 'audioinput') {
          input.push(device);
        } else if (device.kind === 'audiooutput') {
          output.push(device);
        }
      }
      this.inputDevices = input;
      this.outputDevices = output;
    },
    async getDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.processDevices(devices);
    },
    async getUserMedia() {
      const constraints = {
        audio: { deviceId: this.inputId ? { exact: this.inputId } : undefined }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;

      console.log(stream);

      await this.getDevices();
    }
  },
  async mounted() {
    await this.getDevices();

    await this.getUserMedia();
  }
});
