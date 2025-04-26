
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

class WelcomeManager {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (!fs.existsSync('welcome-config.json')) {
        fs.writeFileSync('welcome-config.json', '{}', 'utf8');
        return {};
      }
      return JSON.parse(fs.readFileSync('welcome-config.json', 'utf8'));
    } catch (error) {
      console.error('Error loading welcome config:', error);
      return {};
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync('welcome-config.json', JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving welcome config:', error);
      return false;
    }
  }

  setWelcome(guildId, channelId) {
    this.config[guildId] = { channelId };
    return this.saveConfig();
  }

  getWelcomeEmbed(member) {
    return new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Welcome to Anarchy Roleplay Reborn! 🎉')
      .setDescription(`Welcome ${member} to our amazing community!\n\nEnjoy your stay and make sure to check out our channels!`)
      .addFields(
        { name: '📜 Rules', value: 'Please read our server rules in <#rules>', inline: true },
        { name: '🎮 How to Play', value: 'Check <#how-to-play> to get started!', inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: 'Anarchy Roleplay Reborn', iconURL: member.guild.iconURL() });
  }

  getWelcome(guildId) {
    return this.config[guildId];
  }
}

module.exports = new WelcomeManager();
