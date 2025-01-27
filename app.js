import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';
import { ArtifactRenderer } from './artifact-renderer.js';

class ChatBot {
  constructor() {
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler();
    this.artifactRenderer = new ArtifactRenderer();
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
          prompt: `You are a helpful AI assistant with the ability to create interactive content.
          Generate a response to the user's message and optionally create an artifact (HTML/CSS/JS content).
          If the response should be stored as a long-term memory, set shouldRemember to true.
          Use the relevant memories provided if they help inform your response.
          
          If the user asks about changing voices or mentions anything related to voice/speaking,
          use the availableVoices list to suggest appropriate voices and set selectedVoice
          to the best matching voice name.
          
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
          
          Example response with artifact:
          {
            "message": "I've created a simple interactive counter for you:",
            "shouldRemember": false,
            "artifact": {
              "html": "<div id='counter-container'><button id='increment'>Count: 0</button></div>",
              "css": "#counter-container { padding: 20px; text-align: center; } #increment { padding: 10px 20px; }",
              "js": "let count = 0; document.getElementById('increment').addEventListener('click', () => { count++; document.getElementById('increment').textContent = 'Count: ' + count; });",
              "containerId": "counter-container"
            }
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