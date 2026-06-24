const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const activeSockets = new Map();

app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Namba inahitajika!' });
    
    // Kusafisha namba iwe kwenye muundo wa kimataifa (Mfano: 255612801118)
    phone = phone.replace(/[^0-9]/g, '');
    const sessionFolder = path.join(__dirname, `temp_sessions/${phone}`);

    // USALAMA: Zima socket ya zamani kama ipo hewani
    if (activeSockets.has(phone)) {
        try { activeSockets.get(phone).logout(); } catch (e) {}
        activeSockets.delete(phone);
    }
    
    // USALAMA: Futa kabisa folda la zamani ili kuanza upya (Fresh Session Initialization)
    if (fs.existsSync(sessionFolder)) {
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        // UTAMBULISHO RASMI: Chrome ya Linux ndio standard ya WhatsApp Pairing Notifications
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ['Chrome (Linux)', '', '']
        });

        activeSockets.set(phone, sock);
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    const credsPath = path.join(sessionFolder, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath, 'utf-8');
                        const base64Session = Buffer.from(credsData).toString('base64');
                        
                        // Kutuma Session ID halisi kwenye WhatsApp yako ikikubali
                        await sock.sendMessage(phone + '@s.whatsapp.net', {
                            text: `⚡ *MACHA-AI CORE ENGINE LINKED* 🤖\n\nMuunganisho umekamilika kikamilifu kiongozi!\n\n📋 *YAKO SESSION ID (Base64):*\n\n\`\`\`MACHA_XMD_${base64Session}\`\`\`\n\n🔗 *SYSTEM BRAND:* @djmacha255\n👑 *DEVELOPER:* DJ MACHA 255\n\n_Uendeshaji wa seva umekamilika kikamilifu. Usishare kodi hii!_`
                        });
                    }
                    setTimeout(() => {
                        try {
                            sock.logout();
                            activeSockets.delete(phone);
                            fs.rmSync(sessionFolder, { recursive: true, force: true });
                        } catch (e) {}
                    }, 5000);
                } catch (err) {
                    console.error("Error during session transmission:", err);
                }
            }
            if (connection === 'close') activeSockets.delete(phone);
        });

        // 👑 HATUA RAHISI LAKINI MUHIMU: 
        // Kusubiri sekunde 3 kamili ili kuruhusu seva ijiunge na mfumo wa WhatsApp vizuri!
        await delay(3000);

        // Kuomba kodi halisi kutoka seva za WhatsApp
        let code = await sock.requestPairingCode(phone);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        
        return res.json({ code: formattedCode });

    } catch (error) {
        console.error("Main Engine Error:", error);
        activeSockets.delete(phone);
        return res.status(500).json({ error: 'Muda wa seva umeisha, jaribu tena.' });
    }
});

app.listen(PORT, () => {
    console.log(`🎧 PREMIUM MACHA ENGINE RUNNING ON PORT ${PORT}`);
});
