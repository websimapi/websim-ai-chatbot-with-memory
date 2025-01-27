export class SpeechHandler {
  constructor(settings) {
    this.synthesis = window.speechSynthesis;
    this.voice = null;
    this.settings = settings;
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
    
    // Try to restore saved voice
    if (savedVoice) {
      const foundVoice = voices.find(v => v.name === savedVoice);
      if (foundVoice) {
        this.voice = foundVoice;
        return;
      }
    }
    
    // Fallback to default voice selection
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
    // Cancel any ongoing speech
    this.synthesis.cancel();

    // Create and configure utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = this.voice;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Speak the text
    this.synthesis.speak(utterance);

    // Return a promise that resolves when speech is complete
    return new Promise((resolve, reject) => {
      utterance.onend = resolve;
      utterance.onerror = reject;
    });
  }
}