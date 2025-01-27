import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';
import { ArtifactRenderer } from './artifact-renderer.js';
import { Settings } from './settings.js';
import { DebugLogger } from './debug-logger.js';

class ChatBot {
  constructor() {
    this.settings = new Settings();
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler(this.settings);
    this.artifactRenderer = new ArtifactRenderer();
    this.debugLogger = new DebugLogger();
    
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

    this.conversationContext.push({ role: 'user', content: userMessage });

    const relevantMemories = await this.memory.getRelevantMemories(userMessage);
    
    try {
      const response = await this.getAIResponse(userMessage, relevantMemories);
      
      this.conversationContext.push({ role: 'assistant', content: response.message });
      this.addMessageToChat(response.message, 'bot');
      
      try {
        await this.speech.speak(response.message);
      } catch (error) {
        this.debugLogger.logError('Speech synthesis error:', error);
      }

      if (response.shouldRemember) {
        await this.memory.storeMemory(userMessage, response.message);
      }

    } catch (error) {
      this.debugLogger.logError('Error getting AI response:', error);
      this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'bot');
    }
  }

  async getAIResponse(userMessage, relevantMemories) {
    try {
      const voiceRelated = userMessage.toLowerCase().includes('voice') || 
                          userMessage.toLowerCase().includes('speak') ||
                          userMessage.toLowerCase().includes('accent');
      
      const currentSettings = {
        voice: this.settings.getSetting('voice'),
        availableVoices: voiceRelated ? this.speech.getAllVoices() : null
      };

      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You are a helpful AI assistant with the ability to create interactive content.
          Generate a response to the user's message and optionally create an artifact (HTML/CSS/JS content).
          If the response should be stored as a long-term memory, set shouldRemember to true.
          Use the relevant memories provided if they help inform your response.
          
          If the user asks about changing voices or mentions anything related to voice/speaking,
          use the currentSettings.availableVoices list to suggest appropriate voices and set selectedVoice
          to the best matching voice name. The current voice is marked with "current: true" in the list.
          
          If the user requests or would benefit from visual/interactive content, create an appropriate artifact.
          
          interface Response {
            message: string;
            shouldRemember: boolean;
            selectedVoice?: string; // Voice name to switch to, if applicable
            artifact?: {
              html?: string; // HTML content
              css?: string;  // CSS styles
              js?: string;   // JavaScript code
              containerId?: string; // ID for the container element
            };
          }
          
          Example response with voice change:
          {
            "message": "I've changed my voice to Microsoft David. How does this sound?",
            "shouldRemember": false,
            "selectedVoice": "Microsoft David Desktop"
          }
          `,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories,
            currentSettings: currentSettings
          }
        }),
      });
      
      const result = await response.json();
      
      // Handle voice selection
      if (result.selectedVoice) {
        const success = this.speech.setVoice(result.selectedVoice);
        if (!success) {
          result.message += "\n(Note: I wasn't able to switch to the selected voice. I'll continue using my current voice.)";
        }
      }

      // Handle artifact rendering if present
      if (result.artifact) {
        const artifactElement = await this.artifactRenderer.render(result.artifact);
        this.addArtifactToChat(artifactElement);
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

  addArtifactToChat(artifactElement) {
    const artifactContainer = document.createElement('div');
    artifactContainer.classList.add('message', 'bot-message', 'artifact-container');
    artifactContainer.appendChild(artifactElement);
    this.chatHistory.appendChild(artifactContainer);
    this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
  }

}

// Initialize the chatbot when the page loads
window.addEventListener('DOMContentLoaded', () => {
  new ChatBot();
});