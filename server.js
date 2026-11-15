const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize AI with the key securely stored in Render's environment variables
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Load memories into the server's RAM on startup
const chatData = JSON.parse(
  fs.readFileSync('./cleaned_chat_dataset.json', 'utf8'),
);

function getRelevantMemories(userMessage, topK = 3) {
  const queryWords = new Set(
    userMessage.toLowerCase().replace(/[?!]/g, '').split(' '),
  );

  let scoredPairs = chatData.map((pair) => {
    const promptWords = new Set(pair.prompt.toLowerCase().split(' '));
    const intersection = [...queryWords].filter((x) => promptWords.has(x));
    return { score: intersection.length, pair };
  });

  scoredPairs.sort((a, b) => b.score - a.score);
  let bestMatches = scoredPairs
    .slice(0, topK)
    .filter((p) => p.score > 0)
    .map((p) => p.pair);

  if (bestMatches.length < topK) {
    const needed = topK - bestMatches.length;
    const shuffled = [...chatData].sort(() => 0.5 - Math.random());
    bestMatches = bestMatches.concat(shuffled.slice(0, needed));
  }
  return bestMatches;
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const memories = getRelevantMemories(message);
  const memoryContext = memories
    .map((m) => `Kulsum: '${m.prompt}' -> Raza: '${m.response}'`)
    .join('\n');

  const prompt = `You are Raza Abbas texting your girlfriend, Umme Kulsum.
Reply exactly as Raza would. Keep it short, warm, and natural.

Past examples of Raza's style:
${memoryContext}

Kulsum's current message: ${message}
Raza's reply:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: { maxOutputTokens: 40, temperature: 0.7 },
    });

    res.json({ reply: response.text.trim() });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`⚡ AI Server running on port ${PORT}`));
