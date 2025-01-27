export class ChatMemory {
  constructor() {
    this.storageKey = 'chatbot_memories';
    this.memories = this.loadMemories();
  }

  loadMemories() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : [];
  }

  saveMemories() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.memories));
  }

  async storeMemory(userMessage, botResponse, category = 'general') {
    const memory = {
      timestamp: Date.now(),
      userMessage,
      botResponse,
      category
    };
    
    this.memories.push(memory);
    this.saveMemories();
  }

  async shouldStoreMemory(userMessage, botResponse, memoryConfig) {
    try {
      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Given the memory configuration and the current interaction, determine if this should be stored as a memory.
          Consider the memory mode, any specified keywords, and categories.
          If in manual-only mode, only return true if the user explicitly requested to remember something.
          If in remember-all mode, return true unless the interaction is purely conversational with no meaningful content.
          If in selective mode, analyze the content for importance based on the configured categories and keywords.
          
          interface Response {
            shouldStore: boolean;
            category?: string;
            reason?: string;
          }
          
          Example:
          {
            "shouldStore": true,
            "category": "preferences",
            "reason": "Contains user preference information about favorite colors"
          }
          `,
          data: {
            userMessage,
            botResponse,
            memoryConfig
          }
        }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error analyzing memory storage:', error);
      // Default to storing in case of error
      return { shouldStore: true, category: 'general' };
    }
  }

  async getRelevantMemories(userMessage) {
    try {
      const response = await fetch('/api/ai_completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Given the user's message, analyze the stored memories and return the most relevant ones.
          Return an empty array if no memories are relevant.
          
          interface Response {
            relevantMemories: {
              userMessage: string;
              botResponse: string;
              timestamp: number;
            }[];
          }
          
          {
            "relevantMemories": [
              {
                "userMessage": "What's your favorite color?",
                "botResponse": "I particularly like blue, it reminds me of the sky and ocean.",
                "timestamp": 1678234567890
              }
            ]
          }
          `,
          data: {
            currentMessage: userMessage,
            memories: this.memories
          }
        }),
      });
      
      const result = await response.json();
      return result.relevantMemories;
    } catch (error) {
      console.error('Error getting relevant memories:', error);
      return [];
    }
  }

  // Clear all memories
  clearMemories() {
    this.memories = [];
    this.saveMemories();
  }

  // Clear memories by category
  clearMemoriesByCategory(category) {
    this.memories = this.memories.filter(memory => memory.category !== category);
    this.saveMemories();
  }

  // Get memories by category
  getMemoriesByCategory(category) {
    return this.memories.filter(memory => memory.category === category);
  }
}