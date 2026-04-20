<div align="center">
  <h1>Katsucord Selfbot</h1>
  <p>
<a href="https://i.pinimg.com/originals/bc/09/a3/bc09a35115c83769c74700442dab8dec.gif">
<img src="https://i.pinimg.com/originals/bc/09/a3/bc09a35115c83769c74700442dab8dec.gif" alt="Katscord"/>
</a>
  </p>
  <p>Katscord is a Discord Selfbot built with <a href="https://discord.js.org/">discord.js v14</a></p>
  <p>
    <a href="https://github.com/nat9h/Katsumi"><img alt="Stars" src="https://img.shields.io/github/stars/nat9h/Katscord?style=flat&logo=github"></a>
    <a href="https://github.com/nat9h/Katsumi/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/nat9h/Katscord"></a>
    <a href="https://github.com/nat9h/Katsumi/issues"><img alt="Issues" src="https://img.shields.io/github/issues/nat9h/Katscord"></a>
    <a href="https://github.com/nat9h/Katsumi"><img alt="Last Commit" src="https://img.shields.io/github/last-commit/nat9h/Katscord"></a>
    <a href="https://github.com/nat9h/Katsumi"><img alt="Repo Size" src="https://img.shields.io/github/repo-size/nat9h/Katscord"></a>
  </p>
  <p>
    <a href="https://github.com/nat9h/Katsumi/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-informational"></a>
    <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen">
    <a href="https://dsc.gg/natsumiworld"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white"></a>
  </p>
</div>

> **Warning!**  
> Using selfbots violates Discord's Terms of Service. Your account risks permanent suspension. Use at your own risk.

## Features

- Automatic voice channel connection
- Spotify integration using Client Credentials Flow
- Guild and channel management
- Modular command and plugin system
- Production ready with PM2 support

## Installation

### 1. Clone this repository
```bash
git clone https://github.com/nat9h/Katscord.git
cd Katscord
```
### 2. Install dependencies
```bash
npm install
```
### 3. Configure environment variables
```bash
cp .env.example .env
```
### 4. Edit the `.env` file with your credentials.
```bash
USER_TOKEN="" # must using doubletick
GUILD_ID=
VOICE_CHANNEL_ID=
TEXT_CHANNEL_ID=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```
# Running the Bot
### Development
```bash
npm run dev
```
### Production (PM2)
```bash
npm run start:pm2
```

# License
This project is licensed under the MIT License - see the LICENSE file for details.