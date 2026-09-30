const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.resolve(__dirname, '../settings.json');
const SOUNDS_DIR = path.resolve(__dirname, '../sounds');

// Ensure sounds directory exists
if (!fs.existsSync(SOUNDS_DIR)) {
    fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

const SYNTH_PRESETS = [
    { id: 'beeps', name: 'Electronic Beeps', file: null, emoji: '🤖', type: 'synth' },
    { id: 'synth', name: 'Synth Drone', file: null, emoji: '🎶', type: 'synth' },
    { id: 'noise', name: 'Pink Noise', file: null, emoji: '🌊', type: 'synth' },
    { id: 'alarm', name: 'Alarm Siren', file: null, emoji: '🚨', type: 'synth' },
    { id: 'bass', name: 'Deep Bass', file: null, emoji: '🔊', type: 'synth' }
];

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

function humanizeName(filename) {
    const base = path.basename(filename, path.extname(filename));
    return base
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function getEmojiForName(name) {
    const lower = name.toLowerCase();
    if (lower.includes('laugh') || lower.includes('comedy')) return '😂';
    if (lower.includes('chicken') || lower.includes('bird')) return '🐔';
    if (lower.includes('quiet') || lower.includes('mooditu')) return '🤫';
    if (lower.includes('scream') || lower.includes('alarm')) return '🚨';
    if (lower.includes('core') || lower.includes('sound-effect')) return '⚡';
    if (lower.includes('bass') || lower.includes('beat')) return '🔊';
    if (lower.includes('tune') || lower.includes('song')) return '🎵';
    return '🎧';
}

/**
 * Get all sound IDs of uploaded files in the /sounds folder (or root fallbacks)
 */
function getUploadedSoundIds() {
    const ids = [];
    if (fs.existsSync(SOUNDS_DIR)) {
        const files = fs.readdirSync(SOUNDS_DIR);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (AUDIO_EXTENSIONS.has(ext)) {
                ids.push(path.basename(file, ext));
            }
        }
    }

    // Fallbacks if /sounds has fewer than expected
    const fallbacks = [
        'comedy-punda-kaatriya',
        'theriyum-mooditu-poriya',
        'hmmmhmmm',
        'chicken-on-tree-screaming',
        'core-sound-effect'
    ];
    for (const fb of fallbacks) {
        if (!ids.includes(fb)) {
            const fbPath = path.resolve(__dirname, `../${fb}.mp3`);
            if (fs.existsSync(fbPath)) {
                ids.push(fb);
            }
        }
    }

    return ids.length > 0 ? ids : ['comedy-punda-kaatriya'];
}

/**
 * Dynamically scan the /sounds folder and combine with synth presets
 */
function getAvailableSounds() {
    const fileSounds = [];

    if (fs.existsSync(SOUNDS_DIR)) {
        const files = fs.readdirSync(SOUNDS_DIR);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (AUDIO_EXTENSIONS.has(ext)) {
                const id = path.basename(file, ext);
                const name = humanizeName(file);
                fileSounds.push({
                    id,
                    name,
                    file,
                    ext,
                    emoji: getEmojiForName(id),
                    type: 'folder_sound'
                });
            }
        }
    }

    return [...fileSounds, ...SYNTH_PRESETS];
}

// Default initial assignments - each bot guaranteed a distinct uploaded sound
const DEFAULT_ASSIGNMENTS = {
    '1460709989604655134': 'comedy-punda-kaatriya',       // Dk#4806 (Main)
    '1554049771092836442': 'theriyum-mooditu-poriya',      // PODA DAI#3895
    '1554049009319018526': 'hmmmhmmm',                    // Dk#6664
    '1554049432436084787': 'chicken-on-tree-screaming',   // DK BOT#5586
    '1554049545636282439': 'core-sound-effect'            // GTA 6#2131
};

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
        console.warn('[SoundManager] Could not write settings:', e.message);
    }
}

function getAllBotSounds() {
    const settings = readSettings();
    if (!settings.botAudioAssignments) {
        settings.botAudioAssignments = { ...DEFAULT_ASSIGNMENTS };
        writeSettings(settings);
    }
    return { ...DEFAULT_ASSIGNMENTS, ...(settings.botAudioAssignments || {}) };
}

/**
 * Return a guaranteed unique sound for this bot, avoiding any collision with sounds in excludeSounds
 */
function getUniqueSoundForBot(botId, excludeSounds = []) {
    const uploaded = getUploadedSoundIds();
    const assignments = getAllBotSounds();
    const current = assignments[botId];

    // Check if the current assignment is valid, uploaded, and not currently excluded
    if (current && uploaded.includes(current) && !excludeSounds.includes(current)) {
        return current;
    }

    // Find available uploaded sounds not used by other bots
    const available = uploaded.filter(s => !excludeSounds.includes(s));
    let chosen;

    if (available.length > 0) {
        // Pick random from available uploaded sounds
        chosen = available[Math.floor(Math.random() * available.length)];
    } else {
        // If all uploaded sounds are currently in use (more bots than sounds), pick any uploaded
        chosen = uploaded[Math.floor(Math.random() * uploaded.length)] || 'comedy-punda-kaatriya';
    }

    setBotSoundInternal(botId, chosen);
    return chosen;
}

function getBotSound(botId, excludeSounds = []) {
    return getUniqueSoundForBot(botId, excludeSounds);
}

function setBotSoundInternal(botId, sound) {
    const settings = readSettings();
    if (!settings.botAudioAssignments) settings.botAudioAssignments = { ...DEFAULT_ASSIGNMENTS };
    settings.botAudioAssignments[botId] = sound;
    writeSettings(settings);
    return sound;
}

/**
 * Assign a sound to a bot. If another bot is already using this sound,
 * automatically reassign the other bot to a different available uploaded sound
 * so no two bots ever play the same sound!
 */
function setBotSound(botId, sound, knownBotIds = []) {
    const settings = readSettings();
    if (!settings.botAudioAssignments) settings.botAudioAssignments = { ...DEFAULT_ASSIGNMENTS };
    const uploaded = getUploadedSoundIds();

    // Check for collisions with other bots
    const allBotIds = Array.from(new Set([...Object.keys(settings.botAudioAssignments), ...knownBotIds]));
    
    // Set for the requested bot
    settings.botAudioAssignments[botId] = sound;

    // Check if any other bot had this sound
    const conflictingBots = allBotIds.filter(id => id !== botId && settings.botAudioAssignments[id] === sound);

    if (conflictingBots.length > 0) {
        for (const conflictId of conflictingBots) {
            // Find an uploaded sound not currently used by ANY bot
            const currentlyUsed = new Set(Object.values(settings.botAudioAssignments));
            const available = uploaded.filter(s => !currentlyUsed.has(s));
            const newSound = available.length > 0
                ? available[Math.floor(Math.random() * available.length)]
                : uploaded.find(s => s !== sound) || sound;
            settings.botAudioAssignments[conflictId] = newSound;
            console.log(`[SoundManager] 🔀 Collision prevented: Bot [${conflictId}] moved from [${sound}] to unique sound [${newSound}]`);
        }
    }

    writeSettings(settings);
    return settings.botAudioAssignments;
}

/**
 * Randomize sounds across all bots so every single bot has a UNIQUE uploaded sound
 */
function randomizeAllBotSounds(botIds = []) {
    const settings = readSettings();
    const uploaded = getUploadedSoundIds();

    // Combine known IDs
    const allBotIds = Array.from(new Set([...Object.keys(DEFAULT_ASSIGNMENTS), ...botIds]));
    
    // Shuffle uploaded sounds (Fisher-Yates)
    const shuffled = [...uploaded];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    if (!settings.botAudioAssignments) settings.botAudioAssignments = {};

    allBotIds.forEach((id, idx) => {
        const assignedSound = shuffled[idx % shuffled.length];
        settings.botAudioAssignments[id] = assignedSound;
        console.log(`[SoundManager] 🎲 Randomized: Bot [${id}] -> [${assignedSound}]`);
    });

    settings.randomRotation = true;
    writeSettings(settings);
    return settings.botAudioAssignments;
}

/**
 * When a bot finishes playing its sound, select the next random sound from uploaded sounds
 * that NO OTHER BOT is currently playing!
 */
function getNextRandomSoundForBot(botId, currentSound, otherPlayingSounds = []) {
    const uploaded = getUploadedSoundIds();
    
    // Sounds not playing on any other bot
    let candidates = uploaded.filter(s => !otherPlayingSounds.includes(s));

    // If multiple candidates, also avoid repeating the one that just played
    if (candidates.length > 1 && currentSound) {
        const withoutCurrent = candidates.filter(s => s !== currentSound);
        if (withoutCurrent.length > 0) candidates = withoutCurrent;
    }

    // Fallback if all sounds are in use
    if (candidates.length === 0) {
        candidates = uploaded.filter(s => s !== currentSound);
        if (candidates.length === 0) candidates = uploaded;
    }

    const nextSound = candidates[Math.floor(Math.random() * candidates.length)] || 'comedy-punda-kaatriya';
    setBotSoundInternal(botId, nextSound);
    return nextSound;
}

function setAllBotsSound(sound, botIds = []) {
    return setBotSound(botIds[0], sound, botIds);
}

module.exports = {
    SOUNDS_DIR,
    getUploadedSoundIds,
    getAvailableSounds,
    DEFAULT_ASSIGNMENTS,
    getAllBotSounds,
    getBotSound,
    getUniqueSoundForBot,
    setBotSound,
    setAllBotsSound,
    randomizeAllBotSounds,
    getNextRandomSoundForBot
};
