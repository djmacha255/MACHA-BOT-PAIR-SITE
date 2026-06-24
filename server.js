const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Namba ya simu inahitajika!' });
    
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
        phone = '255' + phone.substring(1);
    }

    // Kutumia ID ya kipekee (Random Session) kuzuia matatizo ya kufuta faili lililofungwa
    const uniqueId = crypto.randomBytes(4).toString('hex');
    const sessionFolder = path.join(__dirname, `temp_sessions/${phone}_${uniqueId}`);

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ['Mac OS', 'Chrome', '121.0.0.0']
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
                            text: `⚡ *MACHA-AI CORE ENGINE LINKED* 🤖\n\nMuunganisho umekamilika kikamilifu kiongozi!\n\n📋 *YAKO SESSION ID (Base64):*\n\n\`\`\`MACHA_XMD_${base64Session}\`\`\`\n\n🔗 *SYSTEM BRAND:* @djmacha255\n👑 *DEVELOPER:* DJ MACHA 255`
                        });
                    }
                    setTimeout(() => {
                        try { sock.logout(); fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
                    }, 5000);
                } catch (err) {
                    console.error(err);
                }
            }
        });

        // Kusubiri kwa usalama sekunde 4 muunganisho ukae sawa
        await delay(4000);

        // Kuomba kodi kutoka WhatsApp
        let code = await sock.requestPairingCode(phone);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        
        // Futa folda kimya kimya baada ya kutoa kodi kama haijaunganishwa
        setTimeout(() => {
            try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
        }, 60000);

        return res.json({ success: true, code: formattedCode });

    } catch (error) {
        console.error("Main Engine Error:", error);
        // Safisha faili lililofeli
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
        // Tuma kosa halisi kwenda frontend
        return res.status(500).json({ success: false, error: error.message || 'Seva imeshindwa kuunganisha.' });
    }
});

app.listen(PORT, () => {
    console.log(`🎧 PREMIUM MACHA ENGINE v4 RUNNING ON PORT ${PORT}`);
});
