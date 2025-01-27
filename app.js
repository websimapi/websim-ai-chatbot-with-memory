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
          
          interface Response {
            message: string;
            shouldRemember: boolean;
          }
          
          {
            "message": "I'd be happy to help you with that! Based on our previous conversation about dogs, I think...",
            "shouldRemember": true
          }
          `,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories
          }
        }),
      });
      
      return await response.json();
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