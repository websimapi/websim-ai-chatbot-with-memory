import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';
import { ArtifactRenderer } from './artifact-renderer.js';
import { Settings } from './settings.js';

class ChatBot {
  constructor() {
    this.settings = new Settings();
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler(this.settings);
    this.artifactRenderer = new ArtifactRenderer();
    this.chatHistory = document.getElementById('chatHistory');
    this.userInput = document.getElementById('userInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.toggleInput = document.getElementById('dualRequestToggle');
    
    this.setupEventListeners();
    this.conversationContext = [];
    this.initializeToggle();
  }

  initializeToggle() {
    const isDualMode = this.settings.getSetting('dualRequestMode');
    this.toggleInput.checked = isDualMode;
  }

  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.handleUserInput());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUserInput();
    });
    this.toggleInput.addEventListener('change', (e) => {
      this.settings.updateSetting('dualRequestMode', e.target.checked);
    });
  }

  async handleUserInput() {
    const userMessage = this.userInput.value.trim();
    if (!userMessage) return;

    this.addMessageToChat(userMessage, 'user');
    this.userInput.value = '';

    // Add user message to conversation context
    this.conversationContext.push({ role: 'user', content: userMessage });

    const isDualMode = this.settings.getSetting('dualRequestMode');
    
    try {
      let relevantMemories = [];
      
      // Only fetch memories in dual request mode
      if (isDualMode) {
        relevantMemories = await this.memory.getRelevantMemories(userMessage);
      }
      
      // Get AI response
      const response = await this.getAIResponse(userMessage, relevantMemories, isDualMode);
      
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

  async getAIResponse(userMessage, relevantMemories, isDualMode) {
    try {
      const voiceRelated = userMessage.toLowerCase().includes('voice') || 
                          userMessage.toLowerCase().includes('speak') ||
                          userMessage.toLowerCase().includes('accent');
      
      const currentSettings = {
        voice: this.settings.getSetting('voice'),
        dualRequestMode: isDualMode,
        availableVoices: voiceRelated ? this.speech.getAllVoices() : null
      };

      const prompt = isDualMode ? 
        `You are a helpful AI assistant with the ability to create interactive content.
        Generate a response to the user's message and optionally create an artifact (HTML/CSS/JS content).
        If the response should be stored as a long-term memory, set shouldRemember to true.
        Use the relevant memories provided if they help inform your response.
        
        If the user asks about Dual Request Mode or what it means, explain that:
        "Dual Request Mode means the AI makes two separate analyses for each response:
        1. First, it analyzes your message to find relevant memories from past conversations
        2. Then, it uses those memories alongside the current conversation to give you a more informed response
        
        When disabled, the AI responds using only the current conversation context without checking past memories.
        This mode is useful when you want the AI to have a better memory of past interactions and provide more contextually aware responses."` :
        `You are a helpful AI assistant with the ability to create interactive content and manage memory.
        Generate a response to the user's message and optionally create an artifact (HTML/CSS/JS content).
        Analyze the conversation context to determine if this interaction should be remembered for future reference.
        If you think this interaction contains important information that could be relevant later,
        set shouldRemember to true.
        
        If the user asks about Dual Request Mode or what it means, explain that:
        "Dual Request Mode is currently disabled. When enabled, it allows me to make two separate analyses:
        1. First, I analyze your message to find relevant memories from past conversations
        2. Then, I use those memories alongside the current conversation to give you a more informed response
        
        Currently, I'm operating in single request mode, which means I'm using only our current conversation context
        without checking past memories. You can enable Dual Request Mode using the toggle in the top-right corner
        if you'd like me to include relevant past memories in my responses."`;

      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt + `
          
          If the user asks about changing voices or mentions anything related to voice/speaking,
          use the currentSettings.availableVoices list to suggest appropriate voices and set selectedVoice
          to the best matching voice name. The current voice is marked with "current: true" in the list.
          
          If the user requests or would benefit from visual/interactive content, create an appropriate artifact.
          
          interface Response {
            message: string;
            shouldRemember: boolean;
            selectedVoice?: string;
            artifact?: {
              html?: string;
              css?: string;
              js?: string;
              containerId?: string;
            };
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