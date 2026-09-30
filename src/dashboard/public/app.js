// Dashboard Client App
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSettingsForm();
    initMatrixRain();
    fetchStats();
    fetchVoiceStatus();
    loadDiscordMembers();
    loadMessageHistory();
    setInterval(fetchStats, 3000); // Live poll every 3 seconds
    setInterval(fetchVoiceStatus, 2500); // Live poll voice every 2.5 seconds
});

// Tab Navigation & Mobile Drawer
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
            closeMobileSidebar();
        });
    });

    // Mobile Bottom Nav Buttons
    const mobileBottomBtns = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn[data-tab]');
    mobileBottomBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
            closeMobileSidebar();
        });
    });

    // Mobile Hamburger & Backdrop Handlers
    const menuBtn = document.getElementById('mobile-menu-btn');
    const closeBtn = document.getElementById('mobile-close-sidebar-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    const moreBtn = document.getElementById('mobile-more-btn');

    if (menuBtn) menuBtn.addEventListener('click', toggleMobileSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);
    if (backdrop) backdrop.addEventListener('click', closeMobileSidebar);
    if (moreBtn) moreBtn.addEventListener('click', toggleMobileSidebar);

    // Handle initial hash in URL
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        switchTab(hash);
    }
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('dashboard-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (backdrop) backdrop.classList.toggle('active');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('dashboard-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
}

function switchTab(tabId) {
    // Update active sidebar nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update active mobile bottom nav button
    document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else if (btn.getAttribute('data-tab')) {
            btn.classList.remove('active');
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

        // Update Playback Mode Button
        const modeBtn = document.getElementById('btn-toggle-playback-mode');
        if (modeBtn) {
            if (data.playbackMode === 'one-by-one') {
                modeBtn.innerHTML = '<i class="fa-solid fa-list-ol"></i> Mode: One by One 🔁';
                modeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            } else {
                modeBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Mode: All at Once ⚡';
                modeBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
            }
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
        const inVoice = Boolean(bot.inVoice);
        const channelText = inVoice ? `In Voice: ${escapeHtml(bot.voiceChannel)}` : 'Disconnected from VC';
        const channelClass = inVoice ? 'bot-card-channel in-voice' : 'bot-card-channel disconnected';
        const channelIcon = inVoice ? 'fa-solid fa-volume-high' : 'fa-solid fa-microphone-slash';
        const activeSound = bot.activeSound || bot.assignedSound || 'hmmmhmmm';
        const isMuted = Boolean(bot.muted);
        const volumeVal = bot.volume !== undefined ? bot.volume : 80;

        let transmittingTag = '<span class="bot-badge-tag idle">[STATUS: STANDBY]</span>';
        let animatedEq = '';
        if (inVoice) {
            if (bot.isPlaying) {
                transmittingTag = `<span class="bot-badge-tag transmitting"><i class="fa-solid fa-wave-square fa-fade"></i> TRANSMITTING: ${escapeHtml(activeSound)}</span>`;
                animatedEq = `
                    <div class="cyber-eq-bars">
                        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                    </div>
                `;
            } else if (isSoundActive) {
                transmittingTag = `<span class="bot-badge-tag in-queue"><i class="fa-solid fa-hourglass-half"></i> QUEUED: ${escapeHtml(activeSound)}</span>`;
            }
        }

        const defaultAvatar = `https://cdn.discordapp.com/embed/avatars/${parseInt(bot.id.slice(-2)) % 5}.png`;
        const avatarUrl = bot.avatar || defaultAvatar;
        const assigned = bot.assignedSound || 'comedy-punda-kaatriya';

        const folderSounds = currentSoundPresetsList.filter(s => s.type === 'folder_sound' || s.file);
        const synthSounds = currentSoundPresetsList.filter(s => s.type === 'synth' || !s.file);

        const folderOptionsHtml = folderSounds.map(s => `
            <option value="${s.id}" ${assigned === s.id ? 'selected' : ''}>[AUDIO] ${escapeHtml(s.name)} (${escapeHtml(s.file || s.id)})</option>
        `).join('');

        const synthOptionsHtml = synthSounds.map(s => `
            <option value="${s.id}" ${assigned === s.id ? 'selected' : ''}>[SYNTH] ${escapeHtml(s.name)}</option>
        `).join('');

        return `
            <div class="bot-voice-card ${bot.isPlaying ? 'speaking-active' : ''} ${isMuted ? 'muted-bot' : ''}">
                <div class="bot-card-top">
                    <div class="bot-avatar-wrap">
                        <img src="${avatarUrl}" alt="${escapeHtml(bot.tag)}" class="bot-avatar-img">
                        <span class="bot-online-indicator ${inVoice ? 'voice-online' : 'voice-offline'}"></span>
                    </div>
                    <div class="bot-details">
                        <div class="bot-name-row">
                            <span class="bot-card-name">${escapeHtml(bot.tag)}</span>
                            <span class="bot-mini-id">NODE_${bot.id.slice(-4)}</span>
                        </div>
                        <div class="${channelClass}">
                            <i class="${channelIcon}"></i>
                            <span>${channelText}</span>
                        </div>
                    </div>
                    <div class="bot-quick-toggle">
                        ${inVoice ? `
                            <button class="btn-vc-chip leave" onclick="botToggleVC('${bot.id}', true)" title="Disconnect this bot">
                                <i class="fa-solid fa-power-off"></i> <span>SEVER</span>
                            </button>
                        ` : `
                            <button class="btn-vc-chip join" onclick="botToggleVC('${bot.id}', false)" title="Connect this bot to VC">
                                <i class="fa-solid fa-link"></i> <span>LINK</span>
                            </button>
                        `}
                    </div>
                </div>

                <div class="bot-card-badges">
                    ${transmittingTag}
                    ${isMuted ? '<span class="bot-badge-tag muted-tag"><i class="fa-solid fa-volume-xmark"></i> MUTED</span>' : ''}
                    <span class="bot-badge-tag freq-tag">48kHz OPUS</span>
                </div>

                ${animatedEq}

                <!-- INDIVIDUAL BOT SOUND SELECTOR -->
                <div class="bot-sound-assign-row">
                    <label class="bot-sound-label"><i class="fa-solid fa-microchip"></i> AUDIO_STREAM:</label>
                    <select class="bot-sound-dropdown" onchange="assignBotIndividualSound('${bot.id}', this.value)">
                        <option value="random">🎲 [SHUFFLE_UNIQUE_PAYLOAD]</option>
                        <optgroup label="📁 /sounds Directory (${folderSounds.length} items)">
                            ${folderOptionsHtml}
                        </optgroup>
                        <optgroup label="🤖 Synthesizer Frequencies">
                            ${synthOptionsHtml}
                        </optgroup>
                    </select>
                </div>

                <!-- INDIVIDUAL BOT VOLUME & MUTE -->
                <div class="bot-volume-row">
                    <button class="btn-bot-mute ${isMuted ? 'active-mute' : ''}" onclick="botToggleMute('${bot.id}', ${isMuted})" title="${isMuted ? 'Unmute Bot' : 'Mute Bot'}">
                        <i class="fa-solid ${isMuted ? 'fa-volume-xmark' : (volumeVal === 0 ? 'fa-volume-off' : (volumeVal < 50 ? 'fa-volume-low' : 'fa-volume-high'))}"></i>
                    </button>
                    <div class="bot-volume-slider-wrap">
                        <div class="slider-meta">
                            <span class="cyber-label-mono">GAIN</span>
                            <span id="vol-display-${bot.id}">${volumeVal}%</span>
                        </div>
                        <input type="range" class="bot-volume-slider" min="0" max="100" value="${volumeVal}"
                            oninput="document.getElementById('vol-display-${bot.id}').innerText = this.value + '%'"
                            onchange="botSetVolume('${bot.id}', this.value)">
                    </div>
                </div>

                <!-- PLAY NOW / STOP DIRECT CONTROLS -->
                <div class="bot-card-actions">
                    <button class="btn-bot-sub play-btn" onclick="botPlayNow('${bot.id}')" ${!inVoice ? 'disabled title="Link bot to voice first"' : ''}>
                        <i class="fa-solid fa-play"></i> <span>EXECUTE</span>
                    </button>
                    <button class="btn-bot-sub stop-btn" onclick="botStopSound('${bot.id}')" ${!inVoice ? 'disabled' : ''}>
                        <i class="fa-solid fa-stop"></i> <span>HALT</span>
                    </button>
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

// Individual Bot Handlers
async function botToggleVC(botId, inVoice) {
    try {
        const action = inVoice ? 'leave-bot' : 'join-bot';
        const res = await fetch('/api/voice/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, botId, channelName: 'General Lounge' })
        });
        const data = await res.json();
        if (data.success) {
            showToast(inVoice ? `🛑 Bot #${botId.slice(-4)} disconnected` : `🔌 Bot #${botId.slice(-4)} connecting to voice...`);
            setTimeout(fetchVoiceStatus, 600);
        }
    } catch (e) {
        showToast('❌ Voice toggle error');
    }
}

async function botPlayNow(botId) {
    try {
        showToast(`▶ Bot #${botId.slice(-4)} speaking audio track now...`);
        const res = await fetch('/api/voice/bot/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId })
        });
        const data = await res.json();
        if (data.success) {
            setTimeout(fetchVoiceStatus, 300);
        }
    } catch (e) {
        showToast('❌ Error playing sound on bot');
    }
}

async function botStopSound(botId) {
    try {
        const res = await fetch('/api/voice/bot/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`⏹ Bot #${botId.slice(-4)} audio stopped`);
            setTimeout(fetchVoiceStatus, 300);
        }
    } catch (e) {
        showToast('❌ Error stopping bot audio');
    }
}

async function botSetVolume(botId, volume) {
    try {
        const res = await fetch('/api/voice/bot/volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId, volume: parseInt(volume) })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🔊 Volume set to ${data.volume}% for #${botId.slice(-4)}`);
        }
    } catch (e) {
        showToast('❌ Error adjusting bot volume');
    }
}

async function botToggleMute(botId, isMuted) {
    try {
        const nextState = !isMuted;
        const res = await fetch('/api/voice/bot/mute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId, muted: nextState })
        });
        const data = await res.json();
        if (data.success) {
            showToast(nextState ? `🔇 Bot #${botId.slice(-4)} muted` : `🔊 Bot #${botId.slice(-4)} unmuted`);
            fetchVoiceStatus();
        }
    } catch (e) {
        showToast('❌ Error toggling bot mute');
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

// Toggle Playback Mode: One-by-One (Turn-based) vs All-at-Once (Simultaneous)
async function togglePlaybackModeUI() {
    try {
        const res = await fetch('/api/voice/toggle-playback-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
            const label = data.playbackMode === 'one-by-one' ? 'One by One (Turn-Based)' : 'Simultaneous (All at once)';
            showToast(`🔀 Playback Mode: ${label}`);
            fetchVoiceStatus();
        }
    } catch (e) {
        showToast('❌ Error switching playback mode');
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

// ================================================================
// HACKER MATRIX RAIN BACKGROUND ENGINE
// ================================================================
function initMatrixRain() {
    const canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const chars = '0123456789ABCDEFΞΨΩ010101<>/*#{}[]=+-~';
    const fontSize = 14;
    let columns = Math.floor(canvas.width / fontSize);
    let drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));

    window.addEventListener('resize', () => {
        columns = Math.floor(canvas.width / fontSize);
        drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
    });

    function draw() {
        ctx.fillStyle = 'rgba(4, 8, 16, 0.12)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = `${fontSize}px "Share Tech Mono", monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = chars[Math.floor(Math.random() * chars.length)];
            const x = i * fontSize;
            const y = drops[i] * fontSize;

            const rand = Math.random();
            if (rand > 0.94) {
                ctx.fillStyle = '#ffffff'; // White spark
            } else if (rand > 0.75) {
                ctx.fillStyle = '#00e5ff'; // Cyan pulse
            } else {
                ctx.fillStyle = '#00ff66'; // Matrix green
            }

            ctx.fillText(text, x, y);

            if (y > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }

    setInterval(draw, 50);
}

function toggleCyberFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        showToast('💻 Cyberdeck Fullscreen Engaged');
    } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        showToast('Exit Fullscreen');
    }
}

// ================================================================
// PWA SERVICE WORKER REGISTRATION & MOBILE INSTALL MANAGER
// ================================================================
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            console.log('⚡ [PWA] Service Worker registered:', reg.scope);
        }).catch((err) => {
            console.warn('⚠️ [PWA] Service Worker registration failed:', err);
        });
    });
}

// Capture native install event
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('cyber-install-btn');
    if (installBtn) installBtn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const installBtn = document.getElementById('cyber-install-btn');
    if (installBtn) installBtn.style.display = 'none';
    showToast('🚀 CodeX OS successfully installed as mobile app!');
});

function triggerPWAInstall() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast('📲 Installing CodeX Web Application...');
            }
            deferredPrompt = null;
        });
    } else {
        // Open modal instructions for iOS Safari or manual installation
        openInstallModal();
    }
}

function openInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) modal.classList.add('active');
}

function closeInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) modal.classList.remove('active');
}

function triggerNativePrompt() {
    if (deferredPrompt) {
        triggerPWAInstall();
        closeInstallModal();
    } else {
        showToast('ℹ️ Follow the step instructions above for your phone');
    }
}



