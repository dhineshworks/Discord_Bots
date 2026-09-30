# 🤖 CodeX Bot - Setup & Configuration Guide

Welcome to **CodeX Bot**, an all-in-one multipurpose Discord bot featuring a modern real-time Web Dashboard (`http://localhost:3001`), advanced moderation tools, automated ticket support, server engagement, and customizable protection filters.

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
Run the following command in your terminal from the project folder:
```powershell
npm.cmd install
```

### 2. Configure `config.js`
Open `config.js` in your code editor. You will see:
```javascript
module.exports = {
    token: "YOUR_BOT_TOKEN_HERE",        // Discord Bot Token
    clientId: "YOUR_CLIENT_ID_HERE",    // Application Client ID
    guildId: "",                        // (Optional) Server ID for instant command testing
    dashboard: {
        port: 3001                      // Dashboard port (http://localhost:3001)
    }
};
```

#### How to obtain your Token and Client ID:
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and enter a name (e.g. `CodeX Bot`).
3. Under **General Information**, copy the **APPLICATION ID** and paste it as `clientId`.
4. Go to the **Bot** tab on the left menu:
   - Click **Reset Token** (or Copy Token) and paste it as `token` in `config.js`.
   - Scroll down to **Privileged Gateway Intents** and enable:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
   - Click **Save Changes**.

---

### 3. Invite the Bot to Your Server
Generate an invite link via **OAuth2 > URL Generator**:
- **Scopes**: `bot`, `applications.commands`
- **Bot Permissions**: `Administrator` (or Manage Server, Manage Channels, Moderate Members, Send Messages, etc.)
- Open the generated invite URL in your browser and select your Discord server.

---

### 4. Start the Bot & Dashboard
```powershell
node index.js
```
or
```powershell
npm.cmd start
```

Now open your web browser and navigate to:
👉 **`http://localhost:3001`**

---

## 🌟 Included Features & Modules

- **Modern Web Dashboard**: Real-time bot health meters (ping, memory, uptime), overview stats, toggleable security modules, and interactive configuration directly in your browser.
- **🛡️ Moderation**: `/ban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/clear`, `/slowmode` with audit logs.
- **🎫 Support Tickets**: Interactive `/ticket-panel` with instant button creation and automatic transcript generation on `/close`.
- **🎉 Engagement & Giveaways**: `/giveaway` with automated countdown and winner drawing, `/suggest` with voting reaction buttons, and `/rules`.
- **⚙️ Customization**: Auto-role on member join, custom prefix fallback, and anti-spam/anti-invite protection filters.
