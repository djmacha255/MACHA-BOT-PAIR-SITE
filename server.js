const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Map maalum ya kuzuia mwingiliano wa request kwa namba moja
const activeSockets = new Map();

app.get('/api/pair', async (req, res) => {
    let phone = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Tafadhali weka namba ya simu!' });
    
    // Kusafisha namba
    phone = phone.replace(/[^0-9]/g, '');
    const sessionFolder = path.join(__dirname, `temp_sessions/${phone}`);

    // 1. USALAMA: Kama namba hii ina socket ya zamani inayorun, izime kwanza kabisa
    if (activeSockets.has(phone)) {
        try {
            activeSockets.get(phone).logout();
        } catch (e) {
            // Ikishindwa ku-logout haina shida
        }
        activeSockets.delete(phone);
    }

    // 2. USALAMA: Futa folder la zamani kabisa ili kuzuia creds zilizoharibika (Corrupted Session)
    if (fs.existsSync(sessionFolder)) {
        try {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
        } catch (err) {
            console.log("Imeshindwa kufuta folder la muda: ", err.message);
        }
    }

    // Kuanzisha auth state upya kabisa (Fresh State)
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        // 3. UTAMBULISHO: Kulazimisha mfumo utumie Chrome ya Linux (Uhakika 100% kwa simu za sasa)
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }),
            browser: ['Chrome (Linux)', '', ''] 
        });

        // Tunza hii socket kwenye kumbukumbu ya seva
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
                        
                        // Tuma Session ID ya ukweli kwenye DM ya mtumiaji
                        await sock.sendMessage(phone + '@s.whatsapp.net', {
                            text: `🎧 *MACHA-XMD SESSION GENERATOR* 🤖\n\nMuunganisho umekamilika kikamilifu kiongozi!\n\n📋 *SESSION ID YAKO (Base64):*\n\n\`\`\`MACHA_XMD_${base64Session}\`\`\`\n\nNakili kodi yote hiyo hapo juu uweke kwenye bot lako! 🔥\n\n_Powered by DJ MACHA 255_`
                        });
                    }
                    
                    // Safisha kumbukumbu baada ya sekunde 5
                    setTimeout(() => {
                        try {
                            sock.logout();
                            activeSockets.delete(phone);
                            fs.rmSync(sessionFolder, { recursive: true, force: true });
                        } catch (e) {}
                    }, 5000);

                } catch (err) {
                    console.error("Hitilafu wakati wa kutuma meseji: ", err);
                }
            }

            if (connection === 'close') {
                activeSockets.delete(phone);
            }
        });

        // Subiri kidogo socket itulie kwenye mtandao kabla ya kuvuta code
        await delay(3000);
        
        // Vuta pairing code rasmi kutoka WhatsApp
        let code = await sock.requestPairingCode(phone);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        
        return res.json({ code: formattedCode });

    } catch (error) {
        console.error("Hitilafu kuu ya mfumo: ", error);
        activeSockets.delete(phone);
        return res.status(500).json({ error: 'Imeshindikana kupata code halisi. Jaribu tena baada ya sekunde 10!' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Seva salama ipo hewani kwenye port ${PORT}`);
});
