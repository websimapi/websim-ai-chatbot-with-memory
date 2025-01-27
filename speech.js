export class SpeechHandler {
  constructor() {
    this.synthesis = window.speechSynthesis;
    this.voice = null;
    this.initVoice();
  }

  async initVoice() {
    // Wait for voices to be loaded
    if (speechSynthesis.getVoices().length === 0) {
      await new Promise(resolve => {
        speechSynthesis.addEventListener('voiceschanged', resolve, { once: true });
      });
    }
    
    // Select a natural-sounding English voice
    const voices = speechSynthesis.getVoices();
    this.voice = voices.find(voice => 
      voice.lang.startsWith('en') && voice.localService
    ) || voices[0];
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