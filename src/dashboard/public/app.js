// Dashboard Client App
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSettingsForm();
    fetchStats();
    fetchVoiceStatus();
    loadDiscordMembers();
    loadMessageHistory();
    fetchMusicStatus();
    loadMusicVoiceChannels();
    setInterval(fetchStats, 3000); // Live poll every 3 seconds
    setInterval(fetchVoiceStatus, 2500); // Live poll voice every 2.5 seconds
    setInterval(fetchMusicStatus, 2500); // Live poll music status every 2.5s
});

// Tab Navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Handle initial hash in URL
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        switchTab(hash);
    }
}

function switchTab(tabId) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update active pane
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    const targetPane = document.getElementById(`tab-${tabId}`);
    if (targetPane) {
        targetPane.classList.add('active');
        window.location.hash = tabId;
        if (tabId === 'direct-message') {
            loadDiscordMembers();
            loadMessageHistory();
            updateLivePreview();
        }
    }
}

// Fetch Live Stats from Backend
async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const data = await res.json();

        // Topbar Pills
        document.getElementById('top-status-text').innerText = data.discordConnected ? 'Bot Online' : 'Dashboard Active';
        document.getElementById('top-ping').innerText = `${data.ping}ms`;
        document.getElementById('top-uptime').innerText = data.uptime;
        document.getElementById('top-memory').innerText = data.memory;

        // Overview Stats Cards
        document.getElementById('stat-servers').innerText = data.servers;
        document.getElementById('stat-users').innerText = data.users;
        document.getElementById('stat-commands').innerText = data.commands;

        // Bot Health Progress Bars & Values
        document.getElementById('health-ping-val').innerText = `${data.ping} ms`;
        const pingPercent = Math.min(Math.max((data.ping / 150) * 100, 10), 100);
        document.getElementById('health-ping-bar').style.width = `${pingPercent}%`;

        document.getElementById('health-mem-val').innerText = data.memory;
        const memPercent = Math.min(Math.max((data.memoryNum / 200) * 100, 15), 100);
        document.getElementById('health-mem-bar').style.width = `${memPercent}%`;

        document.getElementById('health-up-val').innerText = data.uptime;
        document.getElementById('health-up-bar').style.width = `${Math.min(data.uptimeMinutes * 5 + 10, 100)}%`;

        // Module Status Updates
        if (data.modules) {
            const protCount = data.modules.protection?.enabled ? '5 active rules' : 'Disabled';
            document.getElementById('mod-prot-text').innerText = protCount;
            document.getElementById('health-prot-val').innerText = data.modules.protection?.enabled ? '5 active' : '0 active';

            if (data.modules.tickets) {
                document.getElementById('mod-tick-text').innerText = data.modules.tickets.enabled 
                    ? `${data.modules.tickets.ticketTypes?.length || 3} ticket types` 
                    : 'Disabled';
            }

            if (data.modules.applications) {
                document.getElementById('mod-app-text').innerText = data.modules.applications.enabled 
                    ? `${data.modules.applications.positions?.length || 2} active positions` 
                    : 'Closed';
            }
        }

        // Update Recent Activity
        if (data.recentActivity && data.recentActivity.length > 0) {
            renderActivity(data.recentActivity);
        }

    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

function renderActivity(activities) {
    const list = document.getElementById('activity-timeline-list');
    if (!list) return;

    list.innerHTML = activities.slice(0, 5).map(act => `
        <div class="activity-item">
            <div class="activity-dot ${act.type || 'blue'}"></div>
            <div class="activity-content">
                <h4>${escapeHtml(act.title)}</h4>
                <p>${escapeHtml(act.description)}</p>
                <span class="activity-time">${escapeHtml(act.time)}</span>
            </div>
        </div>
    `).join('');
}

// Quick Actions Trigger
async function triggerQuickAction(action) {
    try {
        const res = await fetch('/api/quick-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const result = await res.json();
        if (result.success) {
            showToast(`Action executed: ${action.replace('-', ' ')}`);
            fetchStats();
        }
    } catch (err) {
        showToast('Failed to trigger quick action');
    }
}

// Settings Form Handling
function initSettingsForm() {
    const form = document.getElementById('general-settings-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedback = document.getElementById('save-feedback');

        const payload = {
            prefix: document.getElementById('setting-prefix').value,
            themeColor: document.getElementById('setting-color').value,
            modules: {
                protection: {
                    enabled: true,
                    antiSpam: document.getElementById('prot-antispam').checked,
                    antiInvites: document.getElementById('prot-antiinvites').checked,
                    antiMassMention: document.getElementById('prot-antimention').checked,
                    badWordsFilter: document.getElementById('prot-badwords').checked
                },
                logs: {
                    channel: document.getElementById('setting-log-channel').value
                },
                autorole: {
                    roleName: document.getElementById('setting-autorole').value
                }
            }
        };

        try {
            feedback.innerText = 'Saving...';
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                feedback.innerText = 'Settings saved!';
                showToast('Settings saved successfully!');
                setTimeout(() => { feedback.innerText = ''; }, 3000);
                fetchStats();
            }
        } catch (err) {
            feedback.innerText = 'Error saving settings';
        }
    });
}

// Toast Helper
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ================================================================
   VOICE & MULTI-BOT STUDIO LOGIC
   ================================================================ */
let isSoundActive = true;
let currentSoundPresetsList = [];

async function fetchVoiceStatus(isManualRescan = false) {
    const rescanIcon = document.getElementById('folder-rescan-icon');
    if (isManualRescan && rescanIcon) rescanIcon.classList.add('fa-spin');

    try {
        const res = await fetch('/api/voice/status');
        if (!res.ok) return;
        const data = await res.json();

        isSoundActive = data.soundEnabled;
        currentSoundPreset = data.currentSound || 'comedy-punda-kaatriya';
        currentSoundPresetsList = data.soundPresetsList || [];

        // Update Folder Sound Badge
        const folderBadge = document.getElementById('folder-sounds-count-badge');
        if (folderBadge) {
            const folderCount = currentSoundPresetsList.filter(s => s.type === 'folder_sound' || s.file).length;
            folderBadge.innerHTML = `<i class="fa-solid fa-music"></i> ${folderCount} Sounds in /sounds`;
        }

        // Update Master Sound Button & Badge
        const toggleBtn = document.getElementById('btn-toggle-sound');
        const toggleText = document.getElementById('btn-sound-toggle-text');
        const soundLabel = document.getElementById('active-sound-label');
        const statusPill = document.getElementById('master-sound-status-pill');
        const networkBadge = document.getElementById('vc-network-badge');

        if (soundLabel) {
            const activeStreams = data.activeStreamsCount || (data.bots || []).filter(b => b.isPlaying).length;
            soundLabel.innerText = `${activeStreams} Active Audio Streams`;
        }

        if (toggleBtn) {
            if (isSoundActive) {
                toggleBtn.className = 'btn-sound-toggle sound-on';
                toggleText.innerText = 'SOUND ON';
                if (statusPill) {
                    statusPill.className = 'sound-status-pill active-pill';
                    statusPill.innerText = 'Playing';
                }
            } else {
                toggleBtn.className = 'btn-sound-toggle sound-off';
                toggleText.innerText = 'SOUND OFF';
                if (statusPill) {
                    statusPill.className = 'sound-status-pill muted-pill';
                    statusPill.innerText = 'Muted';
                }
            }
        }

        // Count bots in voice
        const botsInVoice = (data.bots || []).filter(b => b.inVoice).length;
        if (networkBadge) {
            networkBadge.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> ${botsInVoice} / ${data.bots.length} in Voice`;
        }

        // Update Auto-Shuffle Button
        const rotBtn = document.getElementById('btn-toggle-rotation');
        if (rotBtn) {
            if (data.randomRotation !== false) {
                rotBtn.innerHTML = '<i class="fa-solid fa-shuffle"></i> Auto-Shuffle: ON';
                rotBtn.style.color = '#38bdf8';
                rotBtn.style.borderColor = '#38bdf8';
            } else {
                rotBtn.innerHTML = '<i class="fa-solid fa-repeat"></i> Auto-Shuffle: OFF';
                rotBtn.style.color = 'var(--text-muted)';
                rotBtn.style.borderColor = 'var(--border-color)';
            }
        }

        // Render Bots Voice Grid
        renderBotsGrid(data.bots || []);

        if (isManualRescan) {
            showToast(`📂 Rescanned /sounds folder: ${currentSoundPresetsList.length} total sounds available`);
        }
    } catch (e) {
        // network error / polling
    } finally {
        if (rescanIcon) rescanIcon.classList.remove('fa-spin');
    }
}

function renderBotsGrid(bots) {
    const container = document.getElementById('bots-voice-container');
    if (!container) return;

    if (!bots || bots.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:10px;">Connecting to Discord bot network...</div>';
        return;
    }

    container.innerHTML = bots.map(bot => {
        const inVoice = bot.inVoice;
        const channelText = inVoice ? `In Voice: ${escapeHtml(bot.voiceChannel)}` : 'Not in voice channel';
        const channelClass = inVoice ? 'bot-card-channel in-voice' : 'bot-card-channel';
        const channelIcon = inVoice ? 'fa-solid fa-volume-high' : 'fa-solid fa-microphone-slash';
        const activeSound = bot.activeSound || bot.assignedSound || 'hmmmhmmm';
        const transmittingTag = inVoice && isSoundActive 
            ? `<span class="bot-badge-tag transmitting"><i class="fa-solid fa-wave-square"></i> ${escapeHtml(activeSound)}</span>` 
            : '<span class="bot-badge-tag idle">Idle</span>';

        const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(bot.id.slice(-2)) % 5}.png`;
        const avatarUrl = bot.avatar || defaultAvatar;
        const assigned = bot.assignedSound || 'comedy-punda-kaatriya';

        const folderSounds = currentSoundPresetsList.filter(s => s.type === 'folder_sound' || s.file);
        const synthSounds = currentSoundPresetsList.filter(s => s.type === 'synth' || !s.file);

        const folderOptionsHtml = folderSounds.map(s => `
            <option value="${s.id}" ${assigned === s.id ? 'selected' : ''}>${s.emoji || '🎵'} ${escapeHtml(s.name)} (${escapeHtml(s.file || s.id)})</option>
        `).join('');

        const synthOptionsHtml = synthSounds.map(s => `
            <option value="${s.id}" ${assigned === s.id ? 'selected' : ''}>${s.emoji || '🤖'} ${escapeHtml(s.name)}</option>
        `).join('');

        return `
            <div class="bot-voice-card">
                <div class="bot-card-top">
                    <div class="bot-avatar-wrap">
                        <img src="${avatarUrl}" alt="${escapeHtml(bot.tag)}" class="bot-avatar-img">
                        <span class="bot-online-indicator"></span>
                    </div>
                    <div class="bot-details">
                        <div class="bot-card-name">${escapeHtml(bot.tag)}</div>
                        <div class="${channelClass}">
                            <i class="${channelIcon}"></i>
                            <span>${channelText}</span>
                        </div>
                    </div>
                </div>

                <div class="bot-card-badges">
                    ${transmittingTag}
                    <span class="bot-badge-tag" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;">ID: ${bot.id.slice(-4)}</span>
                </div>

                <!-- INDIVIDUAL BOT SOUND SELECTOR -->
                <div class="bot-sound-assign-row">
                    <label class="bot-sound-label"><i class="fa-solid fa-folder-open"></i> Sound from /sounds folder:</label>
                    <select class="bot-sound-dropdown" onchange="assignBotIndividualSound('${bot.id}', this.value)">
                        <option value="random">🎲 Random Unique Sound (No duplicate)</option>
                        <optgroup label="📁 /sounds Folder (${folderSounds.length} sounds)">
                            ${folderOptionsHtml}
                        </optgroup>
                        <optgroup label="🤖 Synthesized Presets">
                            ${synthOptionsHtml}
                        </optgroup>
                    </select>
                </div>

                <div class="bot-card-actions">
                    ${inVoice ? `
                        <button class="btn-bot-sub leave-btn" onclick="voiceAction('leave-bot', '${bot.id}')">
                            <i class="fa-solid fa-phone-slash"></i> Disconnect
                        </button>
                    ` : `
                        <button class="btn-bot-sub" onclick="voiceAction('join-bot', '${bot.id}')">
                            <i class="fa-solid fa-phone-volume"></i> Connect VC
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    // Sync to dedicated tab clone if present
    const dedicatedClone = document.getElementById('dedicated-voice-clone');
    const mainVoiceCard = document.querySelector('.voice-studio-card');
    if (dedicatedClone && mainVoiceCard) {
        dedicatedClone.innerHTML = mainVoiceCard.outerHTML;
    }
}

// Upload Audio File directly to /sounds
async function handleSoundUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
        showToast('❌ File too large. Max size is 25MB.');
        return;
    }

    showToast(`⏳ Uploading "${file.name}" to /sounds folder...`);

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const base64Data = reader.result.split(',')[1];
            const res = await fetch('/api/voice/upload-sound', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileData: base64Data
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast(`✅ ${data.message}`);
                event.target.value = '';
                fetchVoiceStatus(true);
            } else {
                showToast(`❌ ${data.error || 'Failed to upload sound'}`);
            }
        } catch (err) {
            console.error('Sound upload error:', err);
            showToast('❌ Error uploading sound file');
        }
    };
    reader.readAsDataURL(file);
}

// Master Sound Toggle (Turn Sound ON / OFF)
async function toggleMasterSound() {
    try {
        const nextState = !isSoundActive;
        const res = await fetch('/api/voice/toggle-sound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: nextState })
        });
        const data = await res.json();
        if (data.success) {
            isSoundActive = data.soundEnabled;
            showToast(isSoundActive ? '🔊 Sound Turned ON (Each bot playing distinct sound)' : '🔇 Sound Turned OFF (Muted)');
            fetchVoiceStatus();
        }
    } catch (e) {
        showToast('Error toggling sound');
    }
}

// Randomize all bots with unique uploaded sounds
async function randomizeAllBotSoundsUI() {
    try {
        showToast('🎲 Shuffling unique uploaded sounds across all bots...');
        const res = await fetch('/api/voice/randomize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ All bots randomized with unique sounds!');
            fetchVoiceStatus();
        } else {
            showToast(`❌ ${data.error || 'Failed to randomize'}`);
        }
    } catch (e) {
        showToast('❌ Error connecting to server');
    }
}

// Toggle Auto-Shuffle when audio ends
async function toggleAutoRotationUI() {
    try {
        const res = await fetch('/api/voice/toggle-rotation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.randomRotation ? '🔀 Auto-Shuffle ON (Unique sound rotation)' : '⏸️ Auto-Shuffle OFF');
            fetchVoiceStatus();
        }
    } catch (e) {
        showToast('❌ Error toggling auto-shuffle');
    }
}

// Assign sound to one specific bot
async function assignBotIndividualSound(botId, sound) {
    try {
        const res = await fetch('/api/voice/assign-sound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId, sound, randomize: sound === 'random' })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🎵 Bot sound updated: [${sound}]`);
            fetchVoiceStatus();
        } else {
            showToast(`Error: ${data.error || 'Failed to assign sound'}`);
        }
    } catch (e) {
        showToast('Network error assigning sound to bot');
    }
}

// Assign sound to ALL bots
async function assignAllBotsSound(sound) {
    try {
        const res = await fetch('/api/voice/assign-sound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sound, assignAll: true, randomize: sound === 'random' })
        });
        const data = await res.json();
        if (data.success) {
            currentSoundPreset = sound;
            isSoundActive = true;
            showToast(sound === 'random' ? '📢 All bots randomized with unique sounds!' : `📢 Sound assigned!`);
            fetchVoiceStatus();
        } else {
            showToast(`Error: ${data.error || 'Failed to assign sound'}`);
        }
    } catch (e) {
        showToast('Network error assigning sound to all bots');
    }
}

async function selectSound(sound) {
    await assignAllBotsSound(sound);
}

// Master Voice Actions (join-all, leave-all, join-bot, leave-bot)
async function voiceAction(action, botId = null) {
    try {
        const res = await fetch('/api/voice/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, botId, channelName: 'General Lounge' })
        });
        const data = await res.json();
        if (data.success) {
            if (action === 'join-all') showToast('Connecting all bots to General Lounge...');
            else if (action === 'leave-all') showToast('Disconnected all bots from voice.');
            else if (action === 'join-bot') showToast('Bot connecting to voice...');
            else if (action === 'leave-bot') showToast('Bot disconnected from voice.');
            setTimeout(fetchVoiceStatus, 800);
        }
    } catch (e) {
        showToast('Voice action failed');
    }
}

// ==========================================
// DIRECT MESSENGER MODULE
// ==========================================
let discordMembersList = [];
let currentDMFormat = 'text';
let currentEmbedColor = '#5865F2';
let isManualIdMode = false;

async function loadDiscordMembers(force = false) {
    const badge = document.getElementById('dm-member-count-badge');
    const select = document.getElementById('dm-user-select');
    const icon = document.getElementById('dm-refresh-icon');

    if (icon) icon.classList.add('fa-spin');
    if (badge) badge.innerText = 'Fetching...';

    try {
        const res = await fetch('/api/discord/members');
        const data = await res.json();

        if (data.success && Array.isArray(data.members)) {
            discordMembersList = data.members;
            const nonBotCount = data.members.filter(m => !m.bot).length;
            if (badge) badge.innerText = `${nonBotCount} members available`;

            // Populate dropdown
            select.innerHTML = '<option value="" disabled selected>-- Select a member --</option>';
            data.members.forEach(member => {
                const opt = document.createElement('option');
                opt.value = member.id;
                const botTag = member.bot ? ' [BOT]' : '';
                opt.textContent = `${member.displayName} (@${member.tag})${botTag} - ${member.guildName}`;
                if (member.bot) opt.disabled = true; // Bot accounts cannot receive DMs
                select.appendChild(opt);
            });

            if (force) showToast(`Loaded ${data.members.length} Discord members`);
        } else {
            if (badge) badge.innerText = 'Bot offline';
        }
    } catch (e) {
        console.error('Failed to load Discord members:', e);
        if (badge) badge.innerText = 'Error loading';
    } finally {
        if (icon) icon.classList.remove('fa-spin');
    }
}

function toggleManualIdMode() {
    isManualIdMode = !isManualIdMode;
    const selectWrap = document.getElementById('dm-select-wrapper');
    const manualWrap = document.getElementById('dm-manual-wrapper');
    const toggleBtn = document.getElementById('toggle-manual-id-btn');
    const memberPill = document.getElementById('selected-member-pill');

    if (isManualIdMode) {
        selectWrap.style.display = 'none';
        manualWrap.style.display = 'block';
        toggleBtn.innerHTML = '<i class="fa-solid fa-list"></i> Select from server list';
        memberPill.style.display = 'none';
    } else {
        selectWrap.style.display = 'block';
        manualWrap.style.display = 'none';
        toggleBtn.innerHTML = '<i class="fa-solid fa-keyboard"></i> Or enter User ID manually';
        onMemberSelected();
    }
    updateLivePreview();
}

function onMemberSelected() {
    const select = document.getElementById('dm-user-select');
    const memberPill = document.getElementById('selected-member-pill');
    const selAvatar = document.getElementById('sel-member-avatar');
    const selName = document.getElementById('sel-member-name');
    const selId = document.getElementById('sel-member-id');
    const selGuild = document.getElementById('sel-member-guild');

    const selectedId = select.value;
    const member = discordMembersList.find(m => m.id === selectedId);

    if (member) {
        memberPill.style.display = 'flex';
        selAvatar.src = member.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
        selName.innerText = `${member.displayName} (@${member.tag})`;
        selId.innerText = `ID: ${member.id}`;
        selGuild.innerText = member.guildName || 'Server Member';
    } else {
        memberPill.style.display = 'none';
    }
}

function setMessageFormat(format) {
    currentDMFormat = format;
    const btnText = document.getElementById('btn-format-text');
    const btnEmbed = document.getElementById('btn-format-embed');
    const embedFields = document.getElementById('embed-fields-container');

    if (format === 'embed') {
        btnText.classList.remove('active');
        btnEmbed.classList.add('active');
        embedFields.style.display = 'block';
    } else {
        btnEmbed.classList.remove('active');
        btnText.classList.add('active');
        embedFields.style.display = 'none';
    }
    updateLivePreview();
}

function setEmbedColor(colorHex, element) {
    currentEmbedColor = colorHex;
    document.querySelectorAll('.color-pill').forEach(p => p.classList.remove('active'));
    if (element && element.classList.contains('color-pill')) {
        element.classList.add('active');
    }
    const customColorInput = document.getElementById('dm-custom-color');
    if (customColorInput) customColorInput.value = colorHex;
    updateLivePreview();
}

function applyPreset(type) {
    const messageInput = document.getElementById('dm-message-text');
    const titleInput = document.getElementById('dm-embed-title');

    if (type === 'notice') {
        setMessageFormat('embed');
        setEmbedColor('#5865F2', document.querySelector('.color-pill[data-color="#5865F2"]'));
        titleInput.value = '📋 Official Server Notice';
        messageInput.value = 'Hello! This is an official notification regarding updates to our Discord community rules and channels. Please review the updated guidelines in the server.';
    } else if (type === 'warning') {
        setMessageFormat('embed');
        setEmbedColor('#ef4444', document.querySelector('.color-pill[data-color="#ef4444"]'));
        titleInput.value = '⚠️ Administrative Warning';
        messageInput.value = 'This is a formal notice regarding recent server activity that violated our community guidelines. Please ensure compliance to avoid further moderation actions.';
    } else if (type === 'ticket') {
        setMessageFormat('embed');
        setEmbedColor('#10b981', document.querySelector('.color-pill[data-color="#10b981"]'));
        titleInput.value = '🎫 Support Ticket Update';
        messageInput.value = 'Your support ticket has received an update from the administration team. Please check the ticket channel for details or reply if you have further inquiries.';
    } else if (type === 'welcome') {
        setMessageFormat('text');
        messageInput.value = 'Hey there! Welcome to the server. Feel free to check out our announcements and let the staff know if you need any assistance.';
    }

    updateLivePreview();
}

function updateLivePreview() {
    const messageText = document.getElementById('dm-message-text').value;
    const embedTitle = document.getElementById('dm-embed-title').value;
    const charCount = document.getElementById('dm-char-count');

    // Update char counter
    if (charCount) charCount.innerText = `${messageText.length} / 2000`;

    // Timestamp
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const previewTime = document.getElementById('preview-timestamp');
    const footerTime = document.getElementById('preview-footer-time');
    if (previewTime) previewTime.innerText = timeStr;
    if (footerTime) footerTime.innerText = timeStr;

    // Toggle Preview Format
    const previewTextBody = document.getElementById('preview-text-body');
    const previewEmbedBody = document.getElementById('preview-embed-body');
    const previewEmbedTitle = document.getElementById('preview-embed-title');
    const previewEmbedDesc = document.getElementById('preview-embed-desc');

    if (currentDMFormat === 'embed') {
        previewTextBody.style.display = 'none';
        previewEmbedBody.style.display = 'block';
        previewEmbedBody.style.borderLeftColor = currentEmbedColor;
        previewEmbedTitle.innerText = embedTitle.trim() || 'Notice Title';
        previewEmbedDesc.innerText = messageText.trim() || 'Your embed description will appear here...';
    } else {
        previewEmbedBody.style.display = 'none';
        previewTextBody.style.display = 'block';
        previewTextBody.innerText = messageText.trim() || 'Your message will appear here in real-time as you type...';
    }
}

async function handleSendDM(event) {
    event.preventDefault();

    let targetUserId = '';
    if (isManualIdMode) {
        targetUserId = document.getElementById('dm-manual-id').value.trim();
    } else {
        targetUserId = document.getElementById('dm-user-select').value;
    }

    const messageText = document.getElementById('dm-message-text').value.trim();
    const embedTitle = document.getElementById('dm-embed-title').value.trim();
    const submitBtn = document.getElementById('btn-submit-dm');

    if (!targetUserId) {
        showToast('Please select a member or enter a valid Discord User ID.');
        return;
    }

    if (!messageText) {
        showToast('Please enter message content.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending Message...';

    try {
        const payload = {
            userId: targetUserId,
            message: messageText,
            asEmbed: currentDMFormat === 'embed',
            embedTitle: currentDMFormat === 'embed' ? embedTitle : null,
            embedColor: currentDMFormat === 'embed' ? currentEmbedColor : null
        };

        const res = await fetch('/api/discord/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            showToast(`✉️ ${data.message}`);
            document.getElementById('dm-message-text').value = '';
            document.getElementById('dm-embed-title').value = '';
            updateLivePreview();
            loadMessageHistory();
            fetchStats();
        } else {
            showToast(`❌ ${data.error || 'Failed to deliver direct message'}`);
        }
    } catch (err) {
        console.error('Error sending DM:', err);
        showToast('❌ Network error while sending direct message.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Direct Message';
    }
}

async function loadMessageHistory() {
    const list = document.getElementById('dm-history-list');
    if (!list) return;

    try {
        const res = await fetch('/api/discord/message-history');
        const data = await res.json();

        if (data.success && data.history && data.history.length > 0) {
            list.innerHTML = data.history.map(item => `
                <div class="dm-history-item">
                    <div class="dm-history-left">
                        <img src="${item.recipientAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="dm-history-avatar" alt="Avatar">
                        <div class="dm-history-details">
                            <span class="dm-history-user">@${item.recipientTag}</span>
                            <span class="dm-history-text">${item.isEmbed ? '🏷️ [Embed] ' : ''}${escapeHtml(item.content)}</span>
                        </div>
                    </div>
                    <div class="dm-history-meta">
                        <span class="badge badge-success">${item.status}</span>
                        <span class="text-muted" style="font-size: 10px;">${item.timestamp}</span>
                    </div>
                </div>
            `).join('');
        } else {
            list.innerHTML = `
                <div class="dm-history-empty">
                    <i class="fa-regular fa-paper-plane"></i>
                    <p>No direct messages sent yet in this session.</p>
                </div>
            `;
        }
    } catch (e) {
        console.error('Failed to load message history:', e);
    }
}

function resetDMForm() {
    document.getElementById('dm-form').reset();
    document.getElementById('dm-user-select').value = '';
    document.getElementById('dm-manual-id').value = '';
    setMessageFormat('text');
    onMemberSelected();
    updateLivePreview();
    showToast('Form cleared.');
}

// ==========================================
// 🎵 LIVE MUSIC PLAYER DASHBOARD CONTROLLER
// ==========================================
let currentMusicStatus = null;

async function loadMusicVoiceChannels() {
    try {
        const res = await fetch('/api/music/voice-channels');
        const data = await res.json();
        const select = document.getElementById('music-voice-select');
        if (!select) return;

        if (data.channels && data.channels.length > 0) {
            select.innerHTML = data.channels.map(ch => 
                `<option value="${ch.id}">${escapeHtml(ch.name)} (${escapeHtml(ch.guildName)})</option>`
            ).join('');
        } else {
            select.innerHTML = '<option value="">Auto Voice Channel</option>';
        }
    } catch (e) {
        console.warn('Failed to load voice channels for music:', e);
    }
}

async function fetchMusicStatus() {
    try {
        const res = await fetch('/api/music/status');
        const data = await res.json();
        currentMusicStatus = data;
        updateMusicPlayerUI(data);
    } catch (e) {
        // silent fail on poll
    }
}

function updateMusicPlayerUI(data) {
    const np = data.nowPlaying;
    const isPlaying = data.active && np && np.song;

    // Cover art
    const coverEl = document.getElementById('music-np-cover');
    if (coverEl) {
        coverEl.src = isPlaying && np.song.thumbnail 
            ? np.song.thumbnail 
            : 'https://assets.stickpng.com/images/580b57fcd9996e24bc43c537.png';
    }

    // EQ bars
    const eqBars = document.getElementById('music-eq-bars');
    if (eqBars) {
        eqBars.style.display = isPlaying && !data.paused ? 'flex' : 'none';
    }

    // Status pill
    const pill = document.getElementById('music-status-pill');
    const pillText = document.getElementById('music-status-text');
    if (pill && pillText) {
        if (!isPlaying) {
            pill.style.background = 'rgba(100, 116, 139, 0.2)';
            pill.style.color = '#94a3b8';
            pillText.innerText = 'NO MUSIC PLAYING';
        } else if (data.paused) {
            pill.style.background = 'rgba(245, 158, 11, 0.2)';
            pill.style.color = '#f59e0b';
            pillText.innerText = 'PAUSED';
        } else {
            pill.style.background = 'rgba(16, 185, 129, 0.2)';
            pill.style.color = '#10b981';
            pillText.innerText = 'LIVE PLAYING';
        }
    }

    // Song meta
    const titleEl = document.getElementById('music-np-title');
    const artistEl = document.getElementById('music-np-artist');
    if (titleEl) titleEl.innerText = isPlaying ? np.song.title : 'Nothing Playing Right Now';
    if (artistEl) artistEl.innerText = isPlaying ? `by ${np.song.artist} • Requested by @${np.song.requester?.tag || 'User'}` : 'Choose a song below or type /play in Discord';

    // Progress bar & timestamps
    const fillEl = document.getElementById('music-progress-fill');
    const curTimeEl = document.getElementById('music-np-current');
    const totTimeEl = document.getElementById('music-np-total');
    if (fillEl && isPlaying && np.totalSec > 0) {
        const pct = Math.min(Math.max((np.currentSec / np.totalSec) * 100, 0), 100);
        fillEl.style.width = `${pct}%`;
    } else if (fillEl) {
        fillEl.style.width = '0%';
    }
    if (curTimeEl) curTimeEl.innerText = isPlaying ? np.currentTime : '00:00';
    if (totTimeEl) totTimeEl.innerText = isPlaying ? np.totalTime : '00:00';

    // Play/Pause button icon
    const icon = document.getElementById('mbtn-playpause-icon');
    if (icon) {
        if (isPlaying && !data.paused) {
            icon.className = 'fa-solid fa-pause';
        } else {
            icon.className = 'fa-solid fa-play';
        }
    }

    // Volume
    const volSlider = document.getElementById('music-vol-slider');
    const volVal = document.getElementById('music-vol-val');
    if (volSlider && data.volume && document.activeElement !== volSlider) {
        volSlider.value = data.volume;
    }
    if (volVal && data.volume) {
        volVal.innerText = `${data.volume}%`;
    }

    // Queue count & list
    const countBadge = document.getElementById('music-queue-count');
    const queueList = document.getElementById('music-queue-items');
    const queue = data.queue || [];
    if (countBadge) countBadge.innerText = `${queue.length} Songs`;

    if (queueList) {
        if (queue.length === 0) {
            queueList.innerHTML = `
                <div class="queue-empty">
                    <i class="fa-solid fa-compact-disc"></i>
                    <p>Queue is empty! Search a song above or use <code>/play &lt;song&gt;</code> in Discord to start playing.</p>
                </div>
            `;
        } else {
            queueList.innerHTML = queue.map((song, i) => `
                <div class="queue-item">
                    <span class="queue-pos">#${i + 1}</span>
                    <img class="queue-thumb" src="${song.thumbnail || 'https://assets.stickpng.com/images/580b57fcd9996e24bc43c537.png'}" alt="cover" />
                    <div class="queue-info">
                        <h4>${escapeHtml(song.title)}</h4>
                        <p>${escapeHtml(song.artist)} • Requested by @${escapeHtml(song.requester?.tag || 'User')}</p>
                    </div>
                    <span class="queue-duration">${song.duration}</span>
                </div>
            `).join('');
        }
    }
}

async function dashboardMusicPlayFromInput() {
    const input = document.getElementById('music-search-input');
    const voiceSelect = document.getElementById('music-voice-select');
    const query = input?.value?.trim();
    if (!query) {
        showToast('Please enter a song name or link to play!', 'warning');
        return;
    }

    const voiceChannelId = voiceSelect?.value || null;
    showToast(`Searching & queuing "${query}"...`);

    try {
        const res = await fetch('/api/music/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'play', query, voiceChannelId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🎵 Queued "${data.result.song.title}"!`, 'success');
            if (input) input.value = '';
            fetchMusicStatus();
        } else {
            showToast(`❌ ${data.error || 'Failed to play track'}`, 'error');
        }
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, 'error');
    }
}

async function dashboardMusicTogglePlay() {
    if (!currentMusicStatus || !currentMusicStatus.active) {
        showToast('No track is currently playing. Search a song to start!', 'info');
        return;
    }
    const action = currentMusicStatus.paused ? 'resume' : 'pause';
    dashboardMusicControl(action);
}

async function dashboardMusicControl(action) {
    try {
        const res = await fetch('/api/music/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (data.success) {
            const labels = {
                pause: '⏸️ Paused playback',
                resume: '▶️ Resumed playback',
                skip: '⏭️ Skipped to next track',
                stop: '⏹️ Stopped music & cleared queue',
                shuffle: '🔀 Queue shuffled!'
            };
            showToast(labels[action] || 'Command executed', 'success');
            setTimeout(fetchMusicStatus, 300);
        } else {
            showToast(`❌ ${data.error || 'Control action failed'}`, 'error');
        }
    } catch (e) {
        showToast(`❌ Error: ${e.message}`, 'error');
    }
}

async function dashboardMusicSetVolume(vol) {
    const valEl = document.getElementById('music-vol-val');
    if (valEl) valEl.innerText = `${vol}%`;
    try {
        await fetch('/api/music/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'volume', volume: vol })
        });
    } catch (_) {}
}


