const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

// Kutengeneza folda la public kiotomatiki kama halipo
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)){
    fs.mkdirSync(publicDir);
}

app.use(express.static('public'));
app.use(express.json());

app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Tafadhali weka namba ya simu!' });
    
    phone = phone.replace(/[^0-9]/g, '');
    const sessionFolder = path.join(__dirname, `temp_sessions/${phone}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ["Mac OS", "Safari", "15.1"]
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    const credsPath = path.join(sessionFolder, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath, 'utf-8');
                        const base64Session = Buffer.from(credsData).toString('base64');
                        
                        await sock.sendMessage(phone + '@s.whatsapp.net', {
                            text: `?? *MACHA-XMD SESSION GENERATOR* ??\n\nMuunganisho umekamilika! \n\n?? *SESSION ID YAKO (Base64):*\n\n\`\`\`MACHA_XMD_${base64Session}\`\`\`\n\n_Powered by DJ MACHA 255_`
                        });
                    }
                    setTimeout(() => {
                        fs.rmSync(sessionFolder, { recursive: true, force: true });
                    }, 5000);
                } catch (err) {
                    console.error(err);
                }
            }
        });

        await delay(3000);
        let code = await sock.requestPairingCode(phone);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code: formattedCode });

    } catch (error) {
        return res.status(500).json({ error: 'Jaribu tena baadaye!' });
    }
});

app.listen(PORT, () => {
    console.log(`?? Seva ipo hewani kwenye port ${PORT}`);
});