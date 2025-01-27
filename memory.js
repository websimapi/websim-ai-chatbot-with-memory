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

  async storeMemory(userMessage, botResponse) {
    const memory = {
      timestamp: Date.now(),
      userMessage,
      botResponse
    };
    
    this.memories.push(memory);
    this.saveMemories();
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
}