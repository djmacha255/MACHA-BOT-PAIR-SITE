const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

const activeSockets = new Map();

app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Namba ya simu inahitajika!' });
    
    // Kusafisha namba na kurekebisha muundo wa 255 kiotomatiki
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
        phone = '255' + phone.substring(1);
    }

    const sessionFolder = path.join(__dirname, `temp_sessions/${phone}`);

    // 1. KUSAFISHA MBRA REKODI: Zima socket iliyopo na futa folda lote ili kuzuia kodi feki
    if (activeSockets.has(phone)) {
        try { activeSockets.get(phone).logout(); } catch (e) {}
        activeSockets.delete(phone);
    }
    
    if (fs.existsSync(sessionFolder)) {
        try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
    }

    // Kuanzisha upya Authentication State safi kabisa
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        // 2. UTAMBULISHO RASMI: Kulazimisha mfumo ujitambulishe kama kivinjari imara cha desktop
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ['Ubuntu', 'Chrome', '110.0.5481.177']
        });

        activeSockets.set(phone, sock);
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`✅ [MACHA ENGINE] Kifaa kimeunganishwa salama: ${phone}`);
                try {
                    const credsPath = path.join(sessionFolder, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const credsData = fs.readFileSync(credsPath, 'utf-8');
                        const base64Session = Buffer.from(credsData).toString('base64');
                        
                        // Tuma ujumbe wa mafanikio kwenye DM yako ya WhatsApp
                        await sock.sendMessage(phone + '@s.whatsapp.net', {
                            text: `⚡ *MACHA-AI CORE ENGINE LINKED* 🤖\n\nMuunganisho umekamilika kikamilifu kiongozi!\n\n📋 *YAKO SESSION ID (Base64):*\n\n\`\`\`MACHA_XMD_${base64Session}\`\`\`\n\n🔗 *SYSTEM BRAND:* @djmacha255\n👑 *DEVELOPER:* DJ MACHA 255\n\n_Uendeshaji wa seva umekamilika kikamilifu. Nakili Session ID hiyo hapo juu na uweke kwenye bot lako!_`
                        });
                    }
                    
                    // Futa session ya muda baada ya sekunde 5 kulinda ulinzi wako
                    setTimeout(() => {
                        try { 
                            sock.logout(); 
                            activeSockets.delete(phone); 
                            fs.rmSync(sessionFolder, { recursive: true, force: true }); 
                        } catch (e) {}
                    }, 5000);

                } catch (err) {
                    console.error("Hitilafu ya kutuma Session ID:", err);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ [MACHA ENGINE] Muunganisho umefungwa. Sababu: ${reason}`);
                activeSockets.delete(phone);
            }
        });

        // 3. ADAPTIVE DELAY: Kusubiri sekunde 5 kamili ili Render imalize kujenga muunganisho wa siri na WhatsApp
        await delay(5000);

        console.log(`🔄 [MACHA ENGINE] Inavuta kodi halisi kutoka WhatsApp kwa ajili ya: ${phone}`);
        
        // Kuomba Pairing Code rasmi kutoka seva za WhatsApp zilizothibitishwa
        let code = await sock.requestPairingCode(phone);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        
        return res.json({ code: formattedCode });

    } catch (error) {
        console.error("Main Engine Crash Error:", error);
        activeSockets.delete(phone);
        return res.status(500).json({ error: 'Seva imeshindwa kusawazisha, tafadhali jaribu tena baada ya sekunde 10.' });
    }
});

app.listen(PORT, () => {
    console.log(`🎧 PREMIUM MACHA ENGINE v3 RUNNING ON PORT ${PORT}`);
});
