const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

function startDashboard(clientProvider, config) {
    const app = express();
    const port = process.env.PORT || (config && config.dashboard && config.dashboard.port) || 3001;
    const settingsPath = path.join(__dirname, '../../settings.json');

    function getClient() {
        const res = typeof clientProvider === 'function' ? clientProvider() : clientProvider;
        if (res && res.mainClient) return res.mainClient;
        return res;
    }

    function getAllClients() {
        const res = typeof clientProvider === 'function' ? clientProvider() : clientProvider;
        if (res && res.getAllClients) return res.getAllClients();
        if (Array.isArray(res)) return res;
        return res ? [res] : [];
    }

    app.use(cors());
    app.use(bodyParser.json({ limit: '25mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));
    app.use((err, req, res, next) => {
        if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
            return res.status(400).json({ error: 'Malformed JSON payload' });
        }
        next(err);
    });

    // ==========================================
    // 🔐 AUTHENTICATION LAYER & SESSION MANAGER
    // ==========================================
    const crypto = require('crypto');
    const ADMIN_ID = process.env.ADMIN_EMAIL || 'dhineshtn0@gmail.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'DK@God';
    const activeSessions = new Map(); // token -> { email, expiresAt }

    function createSessionToken(email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days valid
        activeSessions.set(token, { email, expiresAt });
        return token;
    }

    function isValidToken(token) {
        if (!token) return false;
        const session = activeSessions.get(token);
        if (!session) return false;
        if (Date.now() > session.expiresAt) {
            activeSessions.delete(token);
            return false;
        }
        return true;
    }

    // Public endpoints before auth
    app.post('/api/auth/login', (req, res) => {
        const { id, password } = req.body || {};
        const cleanId = (id || '').trim().toLowerCase();
        const cleanPass = (password || '').trim();

        if (cleanId === ADMIN_ID.toLowerCase() && cleanPass === ADMIN_PASSWORD) {
            const token = createSessionToken(ADMIN_ID);
            console.log(`[Cyberdeck Auth] 🔓 Access Granted to: ${ADMIN_ID}`);
            return res.json({
                success: true,
                token,
                user: { email: ADMIN_ID, role: 'Root Commander' },
                message: 'Access granted. Welcome Commander.'
            });
        }

        console.warn(`[Cyberdeck Auth] 🛑 Failed login attempt for: "${cleanId}"`);
        return res.status(401).json({
            success: false,
            error: 'ACCESS DENIED: Invalid Terminal ID or Security Password.'
        });
    });

    app.get('/api/auth/check', (req, res) => {
        const authHeader = req.headers.authorization;
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        } else if (req.query && req.query.token) {
            token = req.query.token;
        }

        if (isValidToken(token)) {
            const session = activeSessions.get(token);
            return res.json({ authenticated: true, user: session.email });
        }
        return res.json({ authenticated: false });
    });

    app.post('/api/auth/logout', (req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7).trim();
            activeSessions.delete(token);
        }
        res.json({ success: true, message: 'Terminal disconnected.' });
    });

    // Protect all remaining /api/* routes
    app.use('/api', (req, res, next) => {
        const authHeader = req.headers.authorization;
        let token = null;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        } else if (req.query && req.query.token) {
            token = req.query.token;
        }

        if (isValidToken(token)) {
            return next();
        }

        return res.status(401).json({
            error: 'Unauthorized: Valid Cyberdeck Terminal authorization required.',
            authenticated: false
        });
    });

    app.use(express.static(path.join(__dirname, 'public')));

    function readSettings() {
        try {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        } catch (e) {
            return {};
        }
    }

    function writeSettings(data) {
        fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8');
    }

    // 1. Live Stats API
    app.get('/api/stats', (req, res) => {
        const client = getClient();
        const isConnected = Boolean(client && client.isReady && client.isReady());
        const settings = readSettings();

        const memoryMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const uptimeMins = Math.floor(process.uptime() / 60);

        const serverCount = isConnected ? client.guilds.cache.size : (settings.stats?.lastKnownServers || 1);
        const userCount = isConnected
            ? client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)
            : (settings.stats?.lastKnownUsers || 15);
        const ping = isConnected ? Math.round(client.ws.ping) : 42;

        res.json({
            online: true,
            discordConnected: isConnected,
            botName: client?.user?.username || "CodeX Bot",
            avatarUrl: client?.user?.displayAvatarURL() || null,
            servers: serverCount,
            users: userCount,
            commands: settings.stats?.commandsExecuted || 37,
            ping: ping,
            memory: `${memoryMb} MB`,
            memoryNum: parseFloat(memoryMb),
            uptime: `${uptimeMins}m`,
            uptimeMinutes: uptimeMins,
            modules: settings.modules || {},
            recentActivity: settings.recentActivity || []
        });
    });

    // 2. Settings API
    app.get('/api/settings', (req, res) => {
        res.json(readSettings());
    });

    app.post('/api/settings', (req, res) => {
        try {
            const current = readSettings();
            const incomingModules = req.body.modules || {};
            const updated = {
                ...current,
                ...req.body,
                modules: {
                    ...(current.modules || {}),
                    ...incomingModules,
                    protection: {
                        ...((current.modules && current.modules.protection) || {}),
                        ...(incomingModules.protection || {})
                    },
                    logs: {
                        ...((current.modules && current.modules.logs) || {}),
                        ...(incomingModules.logs || {})
                    },
                    autorole: {
                        ...((current.modules && current.modules.autorole) || {}),
                        ...(incomingModules.autorole || {})
                    }
                }
            };
            writeSettings(updated);

            // Add activity entry
            if (updated.recentActivity) {
                updated.recentActivity.unshift({
                    title: "Settings Updated",
                    description: "Server configuration adjusted via Dashboard",
                    time: "Just now",
                    type: "info"
                });
                if (updated.recentActivity.length > 10) updated.recentActivity.pop();
                writeSettings(updated);
            }

            res.json({ success: true, message: "Settings saved successfully!", settings: updated });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 3. Command List API
    app.get('/api/commands', (req, res) => {
        const generalCmds = require('../commands/general.js');
        const modCmds = require('../commands/moderation.js');
        const ticketCmds = require('../commands/tickets.js');
        const engageCmds = require('../commands/engagement.js');

        const all = [...generalCmds, ...modCmds, ...ticketCmds, ...engageCmds].map(c => ({
            name: c.data.name,
            description: c.data.description,
            category: c.category || 'General',
            options: c.data.options ? c.data.options.map(o => o.name) : []
        }));

        res.json(all);
    });

    // 4. Quick Actions API
    app.post('/api/quick-action', (req, res) => {
        try {
            const { action } = req.body;
            const settings = readSettings();
            settings.modules = settings.modules || {};

            if (action === 'toggle-protection') {
                settings.modules.protection = settings.modules.protection || { enabled: true };
                settings.modules.protection.enabled = !settings.modules.protection.enabled;
                settings.recentActivity.unshift({
                    title: settings.modules.protection.enabled ? "Protection Enabled" : "Protection Disabled",
                    description: "Security filters updated via Quick Actions",
                    time: "Just now",
                    type: settings.modules.protection.enabled ? "purple" : "warning"
                });
            } else if (action === 'toggle-tickets') {
                settings.modules.tickets = settings.modules.tickets || { enabled: true };
                settings.modules.tickets.enabled = !settings.modules.tickets.enabled;
                settings.recentActivity.unshift({
                    title: settings.modules.tickets.enabled ? "Tickets Enabled" : "Tickets Disabled",
                    description: "Ticket module status switched",
                    time: "Just now",
                    type: "success"
                });
            } else if (action === 'toggle-apply') {
                settings.modules.applications = settings.modules.applications || { enabled: true };
                settings.modules.applications.enabled = !settings.modules.applications.enabled;
                settings.recentActivity.unshift({
                    title: "Applications Toggled",
                    description: "Staff applications status updated",
                    time: "Just now",
                    type: "info"
                });
            }

            if (settings.recentActivity.length > 10) settings.recentActivity.pop();
            writeSettings(settings);
            res.json({ success: true, action, settings });
        } catch (err) {
            console.error('Error in quick action:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 5. Voice & Bot Control API
    const { getVoiceConnection } = require('@discordjs/voice');
    const { 
        joinTargetVoice, 
        leaveTargetVoice, 
        connectAll, 
        disconnectAll, 
        connectBot, 
        disconnectBot, 
        isBotManuallyDisconnected, 
        isGlobalVoiceActive 
    } = require('../voice.js');
    const { playSoundOnConnection, stopSound, getAudioStatus, getActivePlayingSounds, SOUND_PRESETS, MP3_SOUNDS } = require('../audio.js');
    const { 
        getPlaybackMode,
        setPlaybackMode,
        getCurrentTurnBotId,
        startTurnCycle,
        stopTurnCycle,
        triggerManualBotTurn,
        playNextTurn,
        playBotNow,
        stopBotNow,
        setBotVolume,
        setBotMute
    } = require('../turn-manager.js');
    const { 
        getBotSound, 
        getUniqueSoundForBot,
        setBotSound, 
        setAllBotsSound, 
        getAllBotSounds, 
        getAvailableSounds,
        getUploadedSoundIds,
        randomizeAllBotSounds,
        SOUNDS_DIR 
    } = require('../bot-sound-manager.js');

    let currentSoundSelection = 'comedy-punda-kaatriya';

    app.get('/api/voice/status', (req, res) => {
        try {
            const clients = getAllClients();
            const audioStatus = getAudioStatus();
            const botAssignments = getAllBotSounds();
            const currentTurnId = getCurrentTurnBotId();
            const settings = readSettings();
            const botVolumes = settings.botVolumes || {};
            const botMuted = settings.botMuted || {};
            const botList = [];

            for (const c of clients) {
                if (!c.user) continue;

                let connectedVoiceChannel = null;
                let isConnectedToVoice = false;

                for (const guild of c.guilds.cache.values()) {
                    const conn = getVoiceConnection(guild.id, c.user.id);
                    if (conn && conn.state.status !== 'destroyed') {
                        isConnectedToVoice = true;
                        const ch = guild.channels.cache.get(conn.joinConfig.channelId);
                        connectedVoiceChannel = ch ? ch.name : 'Voice Channel';
                        break;
                    }
                }

                const assignedSound = botAssignments[c.user.id] || getBotSound(c.user.id);
                const currentPlayingSound = (audioStatus.streamSounds && audioStatus.streamSounds[c.user.id]) || assignedSound;
                const isSpeakingNow = isConnectedToVoice && (audioStatus.activeKeys.includes(c.user.id) || currentTurnId === c.user.id);

                botList.push({
                    id: c.user.id,
                    tag: c.user.tag,
                    username: c.user.username,
                    avatar: c.user.displayAvatarURL({ dynamic: true }) || null,
                    isReady: Boolean(c.isReady && c.isReady()),
                    inVoice: isConnectedToVoice,
                    voiceChannel: connectedVoiceChannel,
                    isPlaying: isSpeakingNow,
                    isCurrentTurn: currentTurnId === c.user.id,
                    assignedSound: assignedSound,
                    activeSound: currentPlayingSound,
                    volume: botVolumes[c.user.id] !== undefined ? botVolumes[c.user.id] : 80,
                    muted: Boolean(botMuted[c.user.id]),
                    isManuallyDisconnected: isBotManuallyDisconnected(c.user.id)
                });
            }

            const availableSoundsList = getAvailableSounds();

            res.json({
                soundEnabled: audioStatus.isPlaying || (settings.soundEnabled !== false),
                globalVoiceActive: isGlobalVoiceActive(),
                currentSound: currentSoundSelection,
                activeStreamsCount: audioStatus.activeStreamsCount,
                availableSounds: availableSoundsList.map(s => s.id),
                uploadedSoundIds: getUploadedSoundIds(),
                soundPresetsList: availableSoundsList,
                botAssignments: botAssignments,
                randomRotation: settings.randomRotation !== false,
                playbackMode: getPlaybackMode(),
                currentTurnBotId: currentTurnId,
                soundsFolder: SOUNDS_DIR,
                bots: botList
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Upload audio file into /sounds folder
    app.post('/api/voice/upload-sound', (req, res) => {
        try {
            const { fileName, fileData } = req.body;
            if (!fileName || !fileData) {
                return res.status(400).json({ error: 'Missing fileName or fileData' });
            }

            const cleanFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
            const ext = path.extname(cleanFileName).toLowerCase();
            const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];

            if (!allowed.includes(ext)) {
                return res.status(400).json({ error: `File type ${ext} not supported. Allowed: ${allowed.join(', ')}` });
            }

            if (!fs.existsSync(SOUNDS_DIR)) {
                fs.mkdirSync(SOUNDS_DIR, { recursive: true });
            }

            const targetFilePath = path.join(SOUNDS_DIR, cleanFileName);
            const buffer = Buffer.from(fileData, 'base64');
            fs.writeFileSync(targetFilePath, buffer);

            const soundId = path.basename(cleanFileName, ext);
            res.json({
                success: true,
                message: `Sound "${cleanFileName}" successfully saved to /sounds folder!`,
                soundId,
                fileName: cleanFileName,
                availableSounds: getAvailableSounds()
            });
        } catch (e) {
            console.error('Error uploading sound:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // List / refresh sounds in /sounds folder
    app.get('/api/voice/sounds-list', (req, res) => {
        res.json({
            success: true,
            folder: SOUNDS_DIR,
            sounds: getAvailableSounds()
        });
    });

    // Randomize all bots with unique uploaded sounds
    app.post('/api/voice/randomize', (req, res) => {
        try {
            const clients = getAllClients();
            const botIds = clients.filter(c => c.user).map(c => c.user.id);
            const assignments = randomizeAllBotSounds(botIds);

            startTurnCycle();

            res.json({
                success: true,
                message: 'All bots successfully randomized with unique uploaded sounds!',
                assignments,
                playbackMode: getPlaybackMode(),
                status: getAudioStatus()
            });
        } catch (e) {
            console.error('Error randomizing sounds:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // Toggle continuous random auto-rotation
    app.post('/api/voice/toggle-rotation', (req, res) => {
        try {
            const settings = readSettings();
            settings.randomRotation = req.body.enabled !== undefined
                ? Boolean(req.body.enabled)
                : !Boolean(settings.randomRotation !== false);
            writeSettings(settings);

            startTurnCycle();

            res.json({
                success: true,
                randomRotation: settings.randomRotation,
                playbackMode: getPlaybackMode()
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Toggle between One-by-One (turn-based sequential) and Simultaneous playback mode
    app.post('/api/voice/toggle-playback-mode', (req, res) => {
        try {
            const { mode } = req.body;
            const current = getPlaybackMode();
            const newMode = mode || (current === 'one-by-one' ? 'simultaneous' : 'one-by-one');
            const updated = setPlaybackMode(newMode);

            res.json({
                success: true,
                playbackMode: updated,
                status: getAudioStatus()
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/assign-sound', (req, res) => {
        try {
            const { botId, sound, assignAll, randomize } = req.body;
            const clients = getAllClients();
            const botIds = clients.filter(c => c.user).map(c => c.user.id);

            if (randomize || sound === 'random') {
                const assignments = randomizeAllBotSounds(botIds);
                startTurnCycle();
                return res.json({
                    success: true,
                    randomized: true,
                    playbackMode: getPlaybackMode(),
                    botAssignments: getAllBotSounds(),
                    status: getAudioStatus()
                });
            }

            if (!sound) return res.status(400).json({ error: 'Sound parameter required' });

            if (botId) {
                // Assign sound, resolving any collisions with other bots automatically
                const assignments = setBotSound(botId, sound, botIds);
                triggerManualBotTurn(botId, sound);

                res.json({
                    success: true,
                    botId,
                    sound,
                    playbackMode: getPlaybackMode(),
                    botAssignments: getAllBotSounds(),
                    status: getAudioStatus()
                });
            } else {
                return res.status(400).json({ error: 'botId must be provided' });
            }
        } catch (e) {
            console.error('Error assigning sound:', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/toggle-sound', (req, res) => {
        try {
            const { enabled } = req.body;
            const settings = readSettings();
            settings.soundEnabled = enabled !== false;
            writeSettings(settings);

            if (enabled === false) {
                stopTurnCycle();
            } else {
                startTurnCycle();
            }

            res.json({
                success: true,
                soundEnabled: enabled !== false,
                playbackMode: getPlaybackMode(),
                botAssignments: getAllBotSounds(),
                status: getAudioStatus()
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/change-sound', (req, res) => {
        try {
            const { sound } = req.body;
            const clients = getAllClients();
            const botIds = clients.filter(c => c.user).map(c => c.user.id);

            // Randomize all bots with unique sounds
            const assignments = randomizeAllBotSounds(botIds);
            startTurnCycle();

            res.json({ success: true, assignments, playbackMode: getPlaybackMode(), status: getAudioStatus() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/action', (req, res) => {
        try {
            const { action, botId, channelName = 'General Lounge' } = req.body;

            if (action === 'join-all') {
                connectAll(channelName);
            } else if (action === 'leave-all') {
                disconnectAll();
            } else if (action === 'join-bot') {
                if (botId) connectBot(botId, channelName);
            } else if (action === 'leave-bot') {
                if (botId) disconnectBot(botId);
            }

            res.json({ success: true, action, botId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Individual Bot Controls
    app.post('/api/voice/bot/connect', (req, res) => {
        try {
            const { botId, channelName = 'General Lounge' } = req.body;
            if (!botId) return res.status(400).json({ error: 'botId required' });
            const success = connectBot(botId, channelName);
            res.json({ success, botId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/bot/disconnect', (req, res) => {
        try {
            const { botId } = req.body;
            if (!botId) return res.status(400).json({ error: 'botId required' });
            const success = disconnectBot(botId);
            res.json({ success, botId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/bot/play', (req, res) => {
        try {
            const { botId, sound } = req.body;
            if (!botId) return res.status(400).json({ error: 'botId required' });
            playBotNow(botId, sound);
            res.json({ success: true, botId, sound });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/bot/stop', (req, res) => {
        try {
            const { botId } = req.body;
            if (!botId) return res.status(400).json({ error: 'botId required' });
            stopBotNow(botId);
            res.json({ success: true, botId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/bot/volume', (req, res) => {
        try {
            const { botId, volume } = req.body;
            if (!botId) return res.status(400).json({ error: 'botId required' });
            const savedVol = setBotVolume(botId, volume);
            res.json({ success: true, botId, volume: savedVol });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/voice/bot/mute', (req, res) => {
        try {
            const { botId, muted } = req.body;
            if (!botId) return res.status(400).json({ error: 'botId required' });
            const savedMuted = setBotMute(botId, muted);
            res.json({ success: true, botId, muted: savedMuted });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 6. Discord Members & Direct Messaging API
    app.get('/api/discord/members', async (req, res) => {
        try {
            const client = getClient();
            if (!client || !client.isReady || !client.isReady()) {
                return res.json({ success: false, connected: false, members: [] });
            }

            const membersMap = new Map();
            for (const guild of client.guilds.cache.values()) {
                try {
                    let membersList = Array.from(guild.members.cache.values());

                    // If cache only has the bot itself, attempt a quick fetch with 1.5s timeout
                    if (membersList.length <= 1) {
                        try {
                            const fetched = await Promise.race([
                                guild.members.fetch(),
                                new Promise(resolve => setTimeout(() => resolve(null), 1500))
                            ]);
                            if (fetched && fetched.size) {
                                membersList = Array.from(fetched.values());
                            }
                        } catch (e) {
                            // If privileged intent not enabled, fallback to cached
                        }
                    }

                    membersList.forEach(m => {
                        if (!m || !m.user) return;
                        if (!membersMap.has(m.id)) {
                            membersMap.set(m.id, {
                                id: m.id,
                                tag: m.user.tag || m.user.username,
                                username: m.user.username,
                                displayName: m.displayName || m.user.username,
                                avatar: m.user.displayAvatarURL({ extension: 'png', size: 64 }) || null,
                                bot: Boolean(m.user.bot),
                                guildName: guild.name,
                                guildId: guild.id
                            });
                        }
                    });
                } catch (err) {
                    console.warn(`[Member Fetch Error for guild ${guild.id}]:`, err.message);
                }
            }

            const members = Array.from(membersMap.values()).sort((a, b) => {
                if (a.bot !== b.bot) return a.bot ? 1 : -1;
                return a.displayName.localeCompare(b.displayName);
            });

            res.json({ success: true, connected: true, members });
        } catch (e) {
            console.error('Error fetching Discord members:', e);
            res.status(500).json({ success: false, error: e.message, members: [] });
        }
    });

    app.post('/api/discord/send-message', async (req, res) => {
        try {
            const { userId, message, asEmbed, embedTitle, embedColor } = req.body;
            if (!userId || !userId.trim()) {
                return res.status(400).json({ success: false, error: 'User ID is required' });
            }
            if (!message || !message.trim()) {
                return res.status(400).json({ success: false, error: 'Message content cannot be empty' });
            }

            const client = getClient();
            if (!client || !client.isReady || !client.isReady()) {
                return res.status(503).json({ success: false, error: 'Discord bot is currently offline or reconnecting.' });
            }

            const cleanUserId = userId.trim();
            let user;
            try {
                user = await client.users.fetch(cleanUserId);
            } catch (fetchErr) {
                return res.status(404).json({ success: false, error: `Discord user with ID "${cleanUserId}" could not be found.` });
            }

            if (user.bot) {
                return res.status(400).json({ success: false, error: 'Cannot send Direct Messages to bot accounts.' });
            }

            let sendPayload;
            if (asEmbed) {
                const embed = new EmbedBuilder()
                    .setDescription(message.trim())
                    .setTimestamp()
                    .setFooter({
                        text: `Sent via ${client.user.username} Admin Dashboard`,
                        iconURL: client.user.displayAvatarURL()
                    });

                if (embedTitle && embedTitle.trim()) {
                    embed.setTitle(embedTitle.trim());
                }

                let colorInt = 0x5865F2;
                if (embedColor && typeof embedColor === 'string') {
                    const cleaned = embedColor.replace('#', '');
                    const parsed = parseInt(cleaned, 16);
                    if (!isNaN(parsed)) colorInt = parsed;
                }
                embed.setColor(colorInt);

                sendPayload = { embeds: [embed] };
            } else {
                sendPayload = { content: message.trim() };
            }

            await user.send(sendPayload);

            // Log activity into settings
            const settings = readSettings();
            if (!settings.messageHistory) settings.messageHistory = [];
            settings.messageHistory.unshift({
                id: Date.now().toString(),
                recipientId: user.id,
                recipientTag: user.tag || user.username,
                recipientAvatar: user.displayAvatarURL({ extension: 'png', size: 64 }),
                content: message.trim(),
                isEmbed: Boolean(asEmbed),
                embedTitle: embedTitle ? embedTitle.trim() : null,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'Delivered'
            });
            if (settings.messageHistory.length > 20) settings.messageHistory.pop();

            if (settings.recentActivity) {
                settings.recentActivity.unshift({
                    title: `DM Delivered: @${user.username}`,
                    description: message.length > 45 ? `${message.substring(0, 42)}...` : message,
                    time: "Just now",
                    type: "info"
                });
                if (settings.recentActivity.length > 10) settings.recentActivity.pop();
            }
            writeSettings(settings);

            res.json({
                success: true,
                recipient: {
                    id: user.id,
                    username: user.username,
                    tag: user.tag
                },
                message: `Message successfully delivered to @${user.username}!`
            });
        } catch (err) {
            console.error('Error sending direct message:', err);
            let userFriendlyError = err.message;
            if (err.code === 50007) {
                userFriendlyError = "Cannot send DM to this user. Their direct messages might be closed in privacy settings, or they do not share a server with the bot.";
            } else if (err.code === 50001) {
                userFriendlyError = "Bot lacks required permissions or access to direct message this user.";
            }
            res.status(500).json({ success: false, error: userFriendlyError, code: err.code });
        }
    });

    app.get('/api/discord/message-history', (req, res) => {
        const settings = readSettings();
        res.json({ success: true, history: settings.messageHistory || [] });
    });

    // Fallback to Dashboard index
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`\n=================================================`);
        console.log(`🚀 CodeX Bot Dashboard running on port: ${port}`);
        console.log(`=================================================\n`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`\n⚠️  Port ${port} is currently in use. Dashboard already running or port busy.`);
        } else {
            console.error('Dashboard server error:', err);
        }
    });

    return server;
}

module.exports = { startDashboard };
