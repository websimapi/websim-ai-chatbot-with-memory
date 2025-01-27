import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';

class ChatBot {
  constructor() {
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler();
    this.chatHistory = document.getElementById('chatHistory');
    this.userInput = document.getElementById('userInput');
    this.sendBtn = document.getElementById('sendBtn');
    
    this.setupEventListeners();
    this.conversationContext = [];
  }

  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.handleUserInput());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUserInput();
    });
  }

  async handleUserInput() {
    const userMessage = this.userInput.value.trim();
    if (!userMessage) return;

    this.addMessageToChat(userMessage, 'user');
    this.userInput.value = '';

    // Add user message to conversation context
    this.conversationContext.push({ role: 'user', content: userMessage });

    // Get relevant memories
    const relevantMemories = await this.memory.getRelevantMemories(userMessage);
    
    try {
      // First AI call to get response
      const response = await this.getAIResponse(userMessage, relevantMemories);
      
      // Add bot response to conversation context
      this.conversationContext.push({ role: 'assistant', content: response.message });
      
      // Add message to chat
      this.addMessageToChat(response.message, 'bot');
      
      // Speak the response
      await this.speech.speak(response.message);

      // If the AI determined this should be remembered, store it
      if (response.shouldRemember) {
        await this.memory.storeMemory(userMessage, response.message);
      }

    } catch (error) {
      console.error('Error getting AI response:', error);
      this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'bot');
    }
  }

  async getAIResponse(userMessage, relevantMemories) {
    try {
      // If the message contains voice-related keywords, get available voices
      const voiceRelated = userMessage.toLowerCase().includes('voice') || 
                          userMessage.toLowerCase().includes('speak') ||
                          userMessage.toLowerCase().includes('accent');
      
      const availableVoices = voiceRelated ? this.speech.getAllVoices() : null;

      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You are a helpful AI assistant. Generate a response to the user's message.
          If the response should be stored as a long-term memory, set shouldRemember to true.
          Use the relevant memories provided if they help inform your response.
          
          If the user asks about changing voices or mentions anything related to voice/speaking,
          use the availableVoices list to suggest appropriate voices and set selectedVoice
          to the best matching voice name.
          
          interface Response {
            message: string;
            shouldRemember: boolean;
            selectedVoice?: string; // Voice name to switch to, if applicable
          }
          
          Example response for voice request:
          {
            "message": "I have several voices available. Based on your request for a British accent, I'd recommend using 'Microsoft George - English (United Kingdom)'. I've switched to that voice now. How does this sound?",
            "shouldRemember": false,
            "selectedVoice": "Microsoft George - English (United Kingdom)"
          }
          `,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories,
            availableVoices: availableVoices
          }
        }),
      });
      
      const result = await response.json();
      
      // If the AI selected a new voice, try to set it
      if (result.selectedVoice) {
        const success = this.speech.setVoice(result.selectedVoice);
        if (!success) {
          result.message += "\n(Note: I wasn't able to switch to the selected voice. I'll continue using my current voice.)";
        }
      }
      
      return result;
    } catch (error) {
      throw new Error('Failed to get AI response');
    }
  }

  addMessageToChat(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    messageDiv.textContent = message;
    this.chatHistory.appendChild(messageDiv);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }
}

// Initialize the chatbot when the page loads
window.addEventListener('DOMContentLoaded', () => {
  new ChatBot();
});