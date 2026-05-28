const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/chat', async (req, res) => {
    console.log('📨 Received request:', req.body);
    const { apiKey, question } = req.body;

    if (!apiKey || !question) {
        console.log('❌ Missing apiKey or question');
        return res.status(400).json({ error: 'Missing apiKey or question' });
    }

    console.log('✅ Request valid, calling Claude API...');

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 800,
                messages: [{ role: 'user', content: question }]
            })
        });

        console.log('📥 Claude API response status:', response.status);

        const data = await response.json();
        console.log('📤 Sending response to client');
        res.json(data);
    } catch (error) {
        console.log('❌ Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
