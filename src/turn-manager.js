const { getVoiceConnection, getGroups, VoiceConnectionStatus } = require('@discordjs/voice');
const { playSoundOnConnection, stopSound, getAudioStatus } = require('./audio.js');
const { getNextRandomSoundForBot, getUniqueSoundForBot, getAllBotSounds } = require('./bot-sound-manager.js');
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.resolve(__dirname, '../settings.json');

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch (_) {
        return {};
    }
}

function writeSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (e) {
        console.warn('[TurnManager] Could not write settings:', e.message);
    }
}

let turnIndex = 0;
let turnTimeout = null;
let currentTurnBotId = null;
let registeredClientsGetter = null;
let isCycleActive = false;

function setClientsProvider(getter) {
    registeredClientsGetter = getter;
}

function getPlaybackMode() {
    const s = readSettings();
    return s.playbackMode || 'one-by-one';
}

function setPlaybackMode(mode) {
    const s = readSettings();
    s.playbackMode = mode === 'simultaneous' ? 'simultaneous' : 'one-by-one';
    writeSettings(s);
    console.log(`[TurnManager] 🔀 Playback Mode switched to: [${s.playbackMode}]`);
    
    // Restart playback according to new mode
    startTurnCycle();
    return s.playbackMode;
}

function getCurrentTurnBotId() {
    return currentTurnBotId;
}

/**
 * Get all bots currently connected to a voice channel in Ready state
 */
function getEligibleVoiceBots() {
    const clients = registeredClientsGetter ? registeredClientsGetter() : [];
    const readyBots = [];
    const allGroups = getGroups();

    for (const [groupId, guildMap] of allGroups.entries()) {
        for (const [guildId, conn] of guildMap.entries()) {
            if (conn && conn.state.status === VoiceConnectionStatus.Ready) {
                const client = clients.find(c => c.user && c.user.id === groupId);
                readyBots.push({
                    client,
                    botId: groupId,
                    tag: client?.user?.tag || `Bot-${groupId.slice(-4)}`,
                    connection: conn,
                    guildId
                });
            }
        }
    }

    // Sort consistently by botId so turns rotate in predictable order
    readyBots.sort((a, b) => a.botId.localeCompare(b.botId));
    return readyBots;
}

/**
 * Advance to and play the next bot's sound in One-by-One mode
 */
function playNextTurn(forcedBotId = null, forcedSound = null) {
    if (turnTimeout) {
        clearTimeout(turnTimeout);
        turnTimeout = null;
    }

    const settings = readSettings();
    if (settings.soundEnabled === false) {
        stopSound();
        currentTurnBotId = null;
        return;
    }

    const eligible = getEligibleVoiceBots();
    if (eligible.length === 0) {
        currentTurnBotId = null;
        return;
    }

    let targetBot = null;
    if (forcedBotId) {
        targetBot = eligible.find(b => b.botId === forcedBotId);
    }

    if (!targetBot) {
        // Round-robin selection
        const chosenIndex = turnIndex % eligible.length;
        targetBot = eligible[chosenIndex];
        turnIndex++;
    } else {
        const idx = eligible.findIndex(b => b.botId === forcedBotId);
        if (idx !== -1) turnIndex = idx + 1;
    }

    currentTurnBotId = targetBot.botId;

    // Ensure all other bots are quiet
    stopSound();

    // Select the sound for this bot
    const botAssignments = getAllBotSounds();
    const shouldRotate = settings.randomRotation !== false;
    let sound = forcedSound;

    if (!sound) {
        if (shouldRotate) {
            sound = getNextRandomSoundForBot(targetBot.botId, botAssignments[targetBot.botId]);
        } else {
            sound = botAssignments[targetBot.botId] || getUniqueSoundForBot(targetBot.botId);
        }
    }

    console.log(`[TurnManager] 🎙️ [Turn #${turnIndex}] Bot ${targetBot.tag} (${targetBot.botId}) playing [${sound}] (1-by-1)`);

    playSoundOnConnection(targetBot.connection, sound, {
        botId: targetBot.botId,
        onEnd: () => {
            console.log(`[TurnManager] ✅ Bot ${targetBot.tag} completed [${sound}]. Passing turn in 500ms...`);
            currentTurnBotId = null;

            turnTimeout = setTimeout(() => {
                turnTimeout = null;
                const currentSettings = readSettings();
                if ((currentSettings.playbackMode || 'one-by-one') === 'one-by-one' && currentSettings.soundEnabled !== false) {
                    playNextTurn();
                }
            }, 500);
        }
    });
}

/**
 * Start or resume the playback cycle based on current mode
 */
function startTurnCycle() {
    isCycleActive = true;
    const settings = readSettings();
    if (settings.soundEnabled === false) {
        stopSound();
        if (turnTimeout) {
            clearTimeout(turnTimeout);
            turnTimeout = null;
        }
        currentTurnBotId = null;
        return;
    }

    const mode = settings.playbackMode || 'one-by-one';

    if (mode === 'one-by-one') {
        const audioStatus = getAudioStatus();
        // If audio is already actively playing or next turn is already scheduled, don't interrupt!
        if (audioStatus.isPlaying || turnTimeout) {
            return;
        }
        playNextTurn();
    } else {
        if (turnTimeout) {
            clearTimeout(turnTimeout);
            turnTimeout = null;
        }
        // Simultaneous mode: all connected bots play their sound concurrently
        currentTurnBotId = null;
        const eligible = getEligibleVoiceBots();
        const activeSoFar = [];

        for (const bot of eligible) {
            const botSound = getUniqueSoundForBot(bot.botId, activeSoFar);
            activeSoFar.push(botSound);
            playSoundOnConnection(bot.connection, botSound, { botId: bot.botId });
        }
    }
}

/**
 * Stop any active playback cycle and sound
 */
function stopTurnCycle() {
    isCycleActive = false;
    if (turnTimeout) {
        clearTimeout(turnTimeout);
        turnTimeout = null;
    }
    currentTurnBotId = null;
    stopSound();
}

/**
 * Handle manual sound assignment on a specific bot from the dashboard
 */
function triggerManualBotTurn(botId, sound) {
    const settings = readSettings();
    const mode = settings.playbackMode || 'one-by-one';

    if (mode === 'one-by-one') {
        playNextTurn(botId, sound);
    } else {
        const eligible = getEligibleVoiceBots();
        const targetBot = eligible.find(b => b.botId === botId);
        if (targetBot) {
            playSoundOnConnection(targetBot.connection, sound, { botId });
        }
    }
}

/**
 * Watchdog tick to verify that audio is actively running if sound is enabled
 */
function checkTurnHealth() {
    const settings = readSettings();
    if (settings.soundEnabled === false) return;

    const mode = settings.playbackMode || 'one-by-one';
    const audioStatus = getAudioStatus();
    const eligible = getEligibleVoiceBots();

    if (eligible.length === 0) return;

    if (mode === 'one-by-one') {
        // If in one-by-one mode and no audio is currently playing and no turn timeout is pending:
        if (!audioStatus.isPlaying && !turnTimeout) {
            console.log(`[TurnManager Watchdog] 🔄 Audio turn cycle was idle. Restarting next turn...`);
            playNextTurn();
        }
    } else {
        // Simultaneous mode: check if any eligible bot is silent
        for (const bot of eligible) {
            if (!audioStatus.activeKeys.includes(bot.botId)) {
                const botSound = getUniqueSoundForBot(bot.botId);
                console.log(`[TurnManager Watchdog] 🔄 Resuming simultaneous sound for ${bot.tag}: [${botSound}]`);
                playSoundOnConnection(bot.connection, botSound, { botId: bot.botId });
            }
        }
    }
}

/**
 * Play a specific bot immediately (take the turn or speak now)
 */
function playBotNow(botId, sound = null) {
    const settings = readSettings();
    if (sound) {
        if (!settings.botAudioAssignments) settings.botAudioAssignments = {};
        settings.botAudioAssignments[botId] = sound;
        writeSettings(settings);
    }
    playNextTurn(botId, sound);
}

/**
 * Stop sound on a specific bot
 */
function stopBotNow(botId) {
    stopSound(botId);
    if (currentTurnBotId === botId) {
        currentTurnBotId = null;
        if (turnTimeout) clearTimeout(turnTimeout);
        turnTimeout = setTimeout(() => {
            turnTimeout = null;
            const s = readSettings();
            if ((s.playbackMode || 'one-by-one') === 'one-by-one' && s.soundEnabled !== false) {
                playNextTurn();
            }
        }, 500);
    }
}

/**
 * Set individual bot volume (0 to 100)
 */
function setBotVolume(botId, volume) {
    const settings = readSettings();
    if (!settings.botVolumes) settings.botVolumes = {};
    const volNum = Math.max(0, Math.min(100, parseInt(volume) || 0));
    settings.botVolumes[botId] = volNum;
    writeSettings(settings);
    return volNum;
}

/**
 * Set individual bot mute (true/false)
 */
function setBotMute(botId, muted) {
    const settings = readSettings();
    if (!settings.botMuted) settings.botMuted = {};
    settings.botMuted[botId] = Boolean(muted);
    writeSettings(settings);
    if (settings.botMuted[botId]) {
        stopBotNow(botId);
    }
    return settings.botMuted[botId];
}

module.exports = {
    setClientsProvider,
    getPlaybackMode,
    setPlaybackMode,
    getCurrentTurnBotId,
    getEligibleVoiceBots,
    playNextTurn,
    startTurnCycle,
    stopTurnCycle,
    triggerManualBotTurn,
    checkTurnHealth,
    playBotNow,
    stopBotNow,
    setBotVolume,
    setBotMute
};
