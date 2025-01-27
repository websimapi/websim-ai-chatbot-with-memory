export class SpeechHandler {
  constructor(settings) {
    this.synthesis = window.speechSynthesis;
    this.voice = null;
    this.settings = settings;
    this.speaking = false;
    this.cancelled = false;
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

  splitIntoSentences(text) {
    // Handle null/undefined text
    if (!text) return [];
    
    // Ensure text is a string
    const textStr = String(text);
    
    // Split text into sentences using regex
    // This handles common sentence endings (., !, ?) and preserves newlines
    return textStr.split(/(?<=[.!?])\s+|\n+/).filter(sentence => sentence.trim().length > 0);
  }

  async speakSentence(sentence) {
    // Skip empty sentences
    if (!sentence || !sentence.trim()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.voice = this.voice;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onend = () => {
        this.speaking = false;
        resolve();
      };

      utterance.onerror = (error) => {
        this.speaking = false;
        reject(error);
      };

      this.speaking = true;
      this.synthesis.speak(utterance);
    });
  }

  async speak(text) {
    // Handle null/undefined text
    if (!text) return;
    
    // Cancel any ongoing speech
    this.cancel();
    
    const sentences = this.splitIntoSentences(text);
    this.cancelled = false;

    for (const sentence of sentences) {
      if (this.cancelled) break;
      
      try {
        await this.speakSentence(sentence);
        
        // Small pause between sentences
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Error speaking sentence:', error);
        if (!this.cancelled) {
          throw error;
        }
      }
    }
  }

  cancel() {
    this.cancelled = true;
    this.synthesis.cancel();
    this.speaking = false;
  }
}