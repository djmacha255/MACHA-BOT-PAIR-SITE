const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const activeSockets = new Map();

app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Namba inahitajika!' });
    
    phone = phone.replace(/[^0-9]/g, '');
    const sessionFolder = path.join(__dirname, `temp_sessions/${phone}`);

    // Kufuta mabaki haraka sana kulinda usalama
    if (activeSockets.has(phone)) {
        try { activeSockets.get(phone).logout(); } catch (e) {}
        activeSockets.delete(phone);
    }
    if (fs.existsSync(sessionFolder)) {
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        // Toleo bora la kivinjari linalokubalika fasta WhatsApp Servers
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ['Ubuntu', 'Chrome', '110.0.5481.177']
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
                        
                        // Ujumbe rasmi wa kiprofessional kwenda kwa mteja
                        await sock.sendMessage(phone + '@s.whatsapp.net', {
                            text: `⚡ *MACHA-AI CORE ENGINE LINKED* 🤖\n\nHabari kiongozi, mfumo wako umefanikiwa kuunganishwa na *MACHA BOT*[cite: 1]!\n\n📋 *YAKO SESSION ID (Base64):*\n\n\`\`\`MACHA_XMD_${base64Session}\`\`\`\n\n🔗 *SYSTEM BRAND:* @djmacha255\n👑 *DEVELOPER:* DJ MACHA 255\n\n_Usomeshaji na uendeshaji wa seva umekamilika. Usishare kodi hii na mtu yeyote!_`
                        });
                    }
                    setTimeout(() => {
                        try {
                            sock.logout();
                            activeSockets.delete(phone);
                            fs.rmSync(sessionFolder, { recursive: true, force: true });
                        } catch (e) {}
                    }, 4000);
                } catch (err) {
                    console.error(err);
                }
            }
            if (connection === 'close') activeSockets.delete(phone);
        });

        // HAKUNA DELAY - Omba code mara moja!
        let code = await sock.requestPairingCode(phone);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        
        return res.json({ code: formattedCode });

    } catch (error) {
        activeSockets.delete(phone);
        return res.status(500).json({ error: 'Seva imezidiwa, jaribu tena.' });
    }
});

app.listen(PORT, () => {
    console.log(`🎧 MACHA ENGINE RUNNING ON PORT ${PORT}`);
});
