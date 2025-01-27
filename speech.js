export class SpeechHandler {
  constructor(settings) {
    this.synthesis = window.speechSynthesis;
    this.voice = null;
    this.settings = settings;
    this.currentUtterance = null;
    this.isPlaying = false;
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

  splitIntoSentences(text) {
    // Split on periods, exclamation marks, or question marks followed by spaces or end of string
    return text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  }

  async speak(text) {
    // If already speaking, stop current speech
    if (this.isPlaying) {
      this.synthesis.cancel();
      this.isPlaying = false;
    }

    const sentences = this.splitIntoSentences(text);
    this.isPlaying = true;

    for (let sentence of sentences) {
      if (!this.isPlaying) break;

      try {
        await this.speakSentence(sentence.trim());
      } catch (error) {
        console.error('Error speaking sentence:', error);
        this.isPlaying = false;
        throw error;
      }
    }

    this.isPlaying = false;
  }

  async speakSentence(sentence) {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
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
        this.isPlaying = false;
        reject(error);
      };

      // Add a small pause between sentences
      setTimeout(() => {
        if (this.isPlaying) {
          this.synthesis.speak(utterance);
        }
      }, 100);
    });
  }

  stop() {
    this.isPlaying = false;
    if (this.currentUtterance) {
      this.synthesis.cancel();
    }
  }
}