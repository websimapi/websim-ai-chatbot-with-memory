export class SpeechHandler {
  constructor(settings) {
    this.synthesis = window.speechSynthesis;
    this.voice = null;
    this.settings = settings;
    this.currentUtterance = null;
    this.initVoice();
  }

  async initVoice() {
    // Wait for voices to be loaded
    if (speechSynthesis.getVoices().length === 0) {
      await new Promise(resolve => {
        speechSynthesis.addEventListener('voiceschanged', resolve, { once: true });
      });
    }
    
    const voices = speechSynthesis.getVoices();
    const savedVoice = this.settings.getSetting('voice');
    
    if (savedVoice) {
      const foundVoice = voices.find(v => v.name === savedVoice);
      if (foundVoice) {
        this.voice = foundVoice;
        return;
      }
    }
    
    this.voice = voices.find(voice => 
      voice.lang.startsWith('en') && voice.localService
    ) || voices[0];
  }

  getAllVoices() {
    return speechSynthesis.getVoices().map(voice => ({
      name: voice.name,
      lang: voice.lang,
      isLocal: voice.localService,
      current: this.voice && this.voice.name === voice.name
    }));
  }

  setVoice(voiceName) {
    const voices = speechSynthesis.getVoices();
    const newVoice = voices.find(v => v.name === voiceName);
    if (newVoice) {
      this.voice = newVoice;
      this.settings.updateSetting('voice', voiceName);
      return true;
    }
    return false;
  }

  async speak(text) {
    return new Promise((resolve, reject) => {
      // Cancel any ongoing speech
      if (this.currentUtterance) {
        this.synthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.voice;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      this.currentUtterance = utterance;

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (error) => {
        this.currentUtterance = null;
        reject(error);
      };

      this.synthesis.speak(utterance);
    });
  }
}