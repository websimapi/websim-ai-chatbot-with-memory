import { ChatMemory } from './memory.js';
import { SpeechHandler } from './speech.js';
import { ArtifactRenderer } from './artifact-renderer.js';
import { Settings } from './settings.js';
import { CodeManager } from './code-manager.js';

class ChatBot {
  constructor() {
    this.settings = new Settings();
    this.memory = new ChatMemory();
    this.speech = new SpeechHandler(this.settings);
    this.artifactRenderer = new ArtifactRenderer();
    this.codeManager = new CodeManager();
    this.chatHistory = document.getElementById('chatHistory');
    this.userInput = document.getElementById('userInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.toggleInput = document.getElementById('dualRequestToggle');
    this.ttsToggle = document.getElementById('ttsToggle');
    
    this.setupEventListeners();
    this.conversationContext = [];
    this.replyingToMessage = null;
    this.confirmationActive = false;
    this.initializeToggles();
  }

  initializeToggles() {
    const isDualMode = this.settings.getSetting('dualRequestMode');
    const isTtsEnabled = this.settings.getSetting('ttsEnabled');
    
    this.toggleInput.checked = isDualMode;
    this.ttsToggle.checked = isTtsEnabled;
    this.updateRequestModeIcons(isDualMode);
  }

  updateRequestModeIcons(isDualMode) {
    const singleW = document.querySelector('.single-w');
    const dualW = document.querySelector('.dual-w');
    
    if (isDualMode) {
      singleW.classList.add('active');
      dualW.classList.add('active');
    } else {
      singleW.classList.add('active');
      dualW.classList.remove('active');
    }
  }

  createFallingToken(charCount) {
    const token = document.createElement('div');
    token.className = 'falling-token';
    
    const img = document.createElement('img');
    img.src = 'w.png';
    token.appendChild(img);
    
    const countDisplay = document.createElement('div');
    countDisplay.className = 'char-count';
    countDisplay.textContent = this.formatCharCount(charCount);
    token.appendChild(countDisplay);
    
    const container = document.getElementById('tokenContainer');
    const startX = Math.random() * 60; 
    token.style.right = `${startX}px`;
    
    container.appendChild(token);
    
    token.addEventListener('animationend', () => {
      container.removeChild(token);
    });
  }

  formatCharCount(count) {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  }

  setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.handleUserInput());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleUserInput();
    });
    
    this.toggleInput.addEventListener('change', (e) => {
      const isDualMode = e.target.checked;
      this.settings.updateSetting('dualRequestMode', isDualMode);
      this.updateRequestModeIcons(isDualMode);
    });
    
    this.ttsToggle.addEventListener('change', (e) => {
      this.settings.updateSetting('ttsEnabled', e.target.checked);
    });

    this.chatHistory.addEventListener('click', (e) => {
      if (e.target.classList.contains('reply-button')) {
        const messageElement = e.target.closest('.message');
        const messageText = messageElement.querySelector('.message-text').textContent;
        this.handleReply(messageText);
      }
    });
  }

  handleReply(messageText) {
    this.replyingToMessage = messageText;
    this.userInput.placeholder = `Replying to: ${messageText.substring(0, 30)}...`;
    this.userInput.focus();
  }

  async handleUserInput() {
    const userMessage = this.userInput.value.trim();
    if (!userMessage) return;

    // Check if we're waiting for deletion confirmation
    if (this.confirmationActive) {
      if (userMessage.toLowerCase() === 'confirm') {
        this.memory.confirmDeletion(true);
        this.addMessageToChat('Memories deleted successfully.', 'bot');
        this.confirmationActive = false;
      } else {
        this.memory.confirmDeletion(false);
        this.addMessageToChat('Deletion cancelled.', 'bot');
        this.confirmationActive = false;
      }
      this.userInput.value = '';
      return;
    }

    this.addMessageToChat(userMessage, 'user');
    this.userInput.value = '';
    this.userInput.placeholder = 'Type your message...';
    
    // Create context with just the replied-to message if it exists
    if (this.replyingToMessage) {
      this.conversationContext = [
        { role: 'assistant', content: this.replyingToMessage },
        { role: 'user', content: userMessage }
      ];
    } else {
      this.conversationContext.push({ role: 'user', content: userMessage });
    }
    
    const contextString = JSON.stringify(this.conversationContext);
    this.createFallingToken(contextString.length);

    this.createFallingToken(userMessage.length);

    const isDualMode = this.settings.getSetting('dualRequestMode');
    const isTtsEnabled = this.settings.getSetting('ttsEnabled');
    
    try {
      let relevantMemories = [];
      
      if (isDualMode) {
        const memoryContext = JSON.stringify(this.conversationContext);
        this.createFallingToken(memoryContext.length);
        relevantMemories = await this.memory.getRelevantMemories(userMessage);
      }
      
      const response = await this.getAIResponse(userMessage, relevantMemories, isDualMode);
      
      this.conversationContext.push({ role: 'assistant', content: response.message });
      
      this.addMessageToChat(response.message, 'bot');
      
      if (isTtsEnabled) {
        await this.speech.speak(response.message);
      }

      if (response.shouldRemember) {
        const memoryConfig = this.settings.getMemoryConfig();
        const shouldStore = await this.memory.shouldStoreMemory(userMessage, response.message, memoryConfig);
        
        if (shouldStore.shouldStore) {
          await this.memory.storeMemory(userMessage, response.message, shouldStore.category);
        }
      }

      if (response.artifact) {
        const artifactElement = await this.artifactRenderer.render(response.artifact);
        this.addArtifactToChat(artifactElement);
      }

    } catch (error) {
      console.error('Error getting AI response:', error);
      this.addMessageToChat('Sorry, I encountered an error. Please try again.', 'bot');
    }
    
    // Add check for memory deletion requests
    if (userMessage.toLowerCase().includes('delete') || 
        userMessage.toLowerCase().includes('remove') || 
        userMessage.toLowerCase().includes('clear')) {
      const memorySelections = await this.memory.getMemorySelections(userMessage);
      
      if (memorySelections.matches === 'ALL') {
        this.memory.setPendingDeletion('ALL');
        this.addMessageToChat('Are you sure you want to delete ALL memories? Type "confirm" to proceed or any other text to cancel.', 'bot');
        this.confirmationActive = true;
        this.userInput.value = '';
        return;
      }
      
      if (memorySelections.matches.length === 0) {
        this.addMessageToChat('I couldn\'t find any memories matching your request.', 'bot');
        this.userInput.value = '';
        return;
      }

      if (memorySelections.isAmbiguous) {
        let message = memorySelections.suggestedPrompt + '\n\n';
        memorySelections.matches.forEach((memory, index) => {
          message += `${index + 1}. ${this.memory.getMemoryPreview(memory)}\n`;
        });
        message += '\nPlease specify which memory to delete by mentioning its number or more specific details.';
        this.addMessageToChat(message, 'bot');
      } else {
        const memoriesPreview = memorySelections.matches.map(memory => 
          this.memory.getMemoryPreview(memory)
        ).join('\n');
        
        this.memory.setPendingDeletion(memorySelections.matches);
        this.addMessageToChat(`Are you sure you want to delete the following memories?\n\n${memoriesPreview}\n\nType "confirm" to proceed or any other text to cancel.`, 'bot');
        this.confirmationActive = true;
      }
      
      this.userInput.value = '';
      return;
    }

    // Reset reply state
    this.replyingToMessage = null;
  }

  async getAIResponse(userMessage, relevantMemories, isDualMode) {
    try {
      const voiceRelated = userMessage.toLowerCase().includes('voice') || 
                          userMessage.toLowerCase().includes('speak') ||
                          userMessage.toLowerCase().includes('accent');
      
      const isMemoryQuery = userMessage.toLowerCase().includes('memory') || 
                           userMessage.toLowerCase().includes('remember') ||
                           userMessage.toLowerCase().includes('stored');
      
      const isMemoryConfig = userMessage.toLowerCase().includes('memory mode') ||
                            userMessage.toLowerCase().includes('memory settings') ||
                            userMessage.toLowerCase().includes('how to remember');

      const isCodeQuery = userMessage.toLowerCase().includes('code') ||
                         userMessage.toLowerCase().includes('codebase') ||
                         userMessage.toLowerCase().includes('modify') ||
                         userMessage.toLowerCase().includes('change code');

      // Get all memories and memory configuration for context
      const allMemories = this.memory.loadMemories();
      const memoryConfig = this.settings.getMemoryConfig();
      const currentMemoryState = {
        totalMemories: allMemories.length,
        memoryConfig: memoryConfig,
        memories: allMemories,
        memoryManagement: {
          storageKey: this.memory.storageKey,
          availableFunctions: [
            'loadMemories()',
            'storeMemory(userMessage, botResponse, category)',
            'clearMemories()',
            'clearMemoriesByCategory(category)',
            'getMemoriesByCategory(category)',
            'getRelevantMemories(userMessage)',
            'getMemorySelections(query)'
          ]
        }
      };

      const codebase = isCodeQuery ? this.codeManager.getFileContents() : null;

      const currentSettings = {
        voice: this.settings.getSetting('voice'),
        dualRequestMode: isDualMode,
        availableVoices: voiceRelated ? this.speech.getAllVoices() : null,
        memorySystem: currentMemoryState
      };

      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `You are a helpful AI assistant that can generate both text responses and interactive artifacts.
          
          You have full access to the memory system with the following capabilities:
          1. Access all stored memories
          2. View and modify memory configuration
          3. Store new memories
          4. Clear specific or all memories
          5. Search and retrieve relevant memories
          
          Current Memory System Status:
          Storage Key: ${currentMemoryState.memoryManagement.storageKey}
          Total Stored Memories: ${currentMemoryState.totalMemories}
          Memory Configuration: ${JSON.stringify(memoryConfig, null, 2)}
          Available Memory Functions: ${JSON.stringify(currentMemoryState.memoryManagement.availableFunctions, null, 2)}
          
          ${isMemoryQuery ? `
          All Current Memories:
          ${JSON.stringify(currentMemoryState.memories, null, 2)}
          ` : ''}
          
          ${isCodeQuery ? `
          Current Codebase:
          ${JSON.stringify(codebase, null, 2)}
          ` : ''}
          
          Memory System Configuration Options:
          - selective (default): Store important information based on configured categories and keywords
          - remember-all: Store all meaningful interactions
          - manual-only: Only store memories when explicitly requested
          
          For memory queries, you can:
          1. List all stored memories
          2. Search specific memories
          3. Modify memory settings
          4. Delete specific or all memories
          5. Explain current memory configuration
          
          When handling memory deletion:
          1. If request is clear, set up confirmation
          2. If request is ambiguous, list relevant memories
          3. Allow for both specific and bulk deletion
          
          IMPORTANT RENDERING INSTRUCTIONS:
          1. When creating visual/interactive content, use the artifact property
          2. Keep main message conversational - no code/HTML there
          3. Put ALL HTML, CSS, and JavaScript in the artifact property
          4. Explain artifacts in the message property

          interface Response {
            message: string;
            shouldRemember: boolean;
            selectedVoice?: string;
            memoryConfig?: {
              mode?: 'selective' | 'remember-all' | 'manual-only';
              keywords?: string[];
              categories?: string[];
            };
            artifact?: {
              html?: string;
              css?: string;
              js?: string;
              containerId?: string;
            };
            codeChanges?: {
              [filename: string]: string;
            };
          }`,
          data: {
            message: userMessage,
            context: this.conversationContext,
            relevantMemories: relevantMemories,
            currentSettings: currentSettings,
            memorySystem: currentMemoryState,
            codebase: codebase
          }
        })
      });
      
      const result = await response.json();
      
      if (result.memoryConfig) {
        this.settings.updateMemoryConfig(result.memoryConfig);
      }

      if (result.selectedVoice) {
        const success = this.speech.setVoice(result.selectedVoice);
        if (!success) {
          result.message += "\n(Note: I wasn't able to switch to the selected voice. I'll continue using my current voice.)";
        }
      }

      if (result.codeChanges) {
        Object.entries(result.codeChanges).forEach(([filename, content]) => {
          this.codeManager.updateFile(filename, content);
        });
        await this.codeManager.applyCodeChanges();
      }
      
      return result;
    } catch (error) {
      throw new Error('Failed to get AI response');
    }
  }

  addMessageToChat(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-text');
    messageContent.textContent = message;
    messageDiv.appendChild(messageContent);
    
    const replyButton = document.createElement('button');
    replyButton.classList.add('reply-button');
    replyButton.innerHTML = '↩️';
    replyButton.title = 'Reply to this message';
    messageDiv.appendChild(replyButton);

    if (this.replyingToMessage) {
      messageDiv.classList.add('replied-to');
      const replyContext = document.createElement('div');
      replyContext.classList.add('reply-context');
      replyContext.textContent = `↩️ ${this.replyingToMessage.substring(0, 50)}...`;
      messageDiv.appendChild(replyContext);
    }

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

window.addEventListener('DOMContentLoaded', () => {
  new ChatBot();
});