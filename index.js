import express from 'express';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysocket/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// සරල UI එකක් Frontend එක වෙනුවෙන්
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WA Pairing Code Generator</title>
            <style>
                body { font-family: Arial, sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center; width: 350px; }
                input { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; }
                button { background: #25D366; color: white; border: none; padding: 10px 20px; font-size: 16px; border-radius: 5px; cursor: pointer; width: 100%; font-weight: bold; }
                button:hover { background: #20ba5a; }
                #result { margin-top: 20px; font-size: 24px; font-weight: bold; color: #075E54; letter-spacing: 2px; }
                .loading { color: #666; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>WhatsApp Pairer</h2>
                <p style="color:#666; font-size:14px;">ගිණුමට සම්බන්ද කිරීමට අවශ්‍ය දුරකථන අංකය රටේ කේතය සමඟ ඇතුලත් කරන්න. (e.g. 94771234567)</p>
                <input type="text" id="number" placeholder="94771234567">
                <button onclick="getPairingCode()">Get Code</button>
                <div id="result"></div>
            </div>

            <script>
                async function getPairingCode() {
                    const number = document.getElementById('number').value.trim();
                    const resultDiv = document.getElementById('result');
                    if(!number) return alert('කරුණාකර අංකයක් ඇතුලත් කරන්න!');
                    
                    resultDiv.innerHTML = '<span class="loading">කේතය සකසමින් පවතී... විනාඩියක් පමණ ගතවිය හැක.</span>';
                    
                    try {
                        const response = await fetch('/api/pair', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ number })
                        });
                        const data = await response.json();
                        if(data.code) {
                            resultDiv.innerText = data.code;
                        } else {
                            resultDiv.innerText = "Error: " + data.error;
                        }
                    } catch (err) {
                        resultDiv.innerText = "Error connecting to server";
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Pairing Code එක generate කරන API එක
app.post('/api/pair', async (req, res) => {
    let { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Number is required' });

    // Number එකෙන් ඇති හිස්තැන් සහ සලකුණු අයින් කිරීම
    number = number.replace(/[^0-9]/g, '');

    // තාවකාලික සෙෂන් ෆෝල්ඩර් එකක් සෑදීම (හැම request එකකටම අලුත් එකක්)
    const sessionDir = `./session_${Date.now()}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' })
        });

        // WhatsApp Server එකට Connect වන තෙක් පොඩ්ඩක් රැඳී සිටීම
        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered) {
                    const code = await sock.requestPairingCode(number);
                    res.json({ code });
                    
                    // Code එක දුන්නට පස්සේ සෙෂන් ෆෝල්ඩර් එක අයින් කරන්න (Server එක පිරෙන එක නවතින්න)
                    setTimeout(() => {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }, 60000); // විනාඩියකින් ඩිලීට් වේ
                } else {
                    res.json({ error: 'Already registered' });
                }
            } catch (err) {
                res.json({ error: 'Failed to generate code. Try again.' });
            }
        }, 3000); // 3 seconds delay to initialize

    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
