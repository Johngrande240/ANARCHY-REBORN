
const { Client, GatewayIntentBits } = require('discord.js');

function setupStealthCommands(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Stealth Kick/Ban Commands
    if (message.content.startsWith('!stealthkick')) {
      if (message.member.permissions.has('ADMINISTRATOR')) {
        const user = message.mentions.users.first();
        if (user) {
          await message.guild.members.kick(user);
          message.delete();  // Silent, no public message
        }
      }
    }

    // Secret Command Trigger (Easter Egg)
    if (message.content === '!reveal') {
      const responses = [
        "The first secret lore of Anarchy Reborn is...",
        "Did you know? The server has hidden Easter eggs!",
        "Here's a fun fact: You can use !mysterybox to claim a secret prize!"
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      message.reply(randomResponse);
    }

    // Hidden Reaction Role
    if (message.content === '!hiddenrole') {
      const msg = await message.channel.send('React with 🎮 to unlock the hidden role!');
      await msg.react('🎮');
      
      const filter = (reaction, user) => reaction.emoji.name === '🎮' && !user.bot;
      const collector = msg.createReactionCollector({ filter, time: 15000 });
      
      collector.on('collect', (reaction, user) => {
        const member = message.guild.members.cache.get(user.id);
        member.roles.add('YOUR_ROLE_ID');  // Add hidden role
        message.channel.send(`${user.username} has unlocked the secret role!`);
      });
    }

    // Random Fun Facts Command
    if (message.content === '!randomfact') {
      const facts = [
        "NEWLIFE ROLEPLAY REVAMPED started in 2024!",
        "Did you know? You can create your own role with !createRole!",
        "The server has a secret boss fight event in development!"
      ];
      const randomFact = facts[Math.floor(Math.random() * facts.length)];
      message.reply(randomFact);
    }

    // Mystery Box Command (Hidden Rewards)
    if (message.content === '!mysterybox') {
      const rewards = [
        "You won a **VIP Role**!",
        "You got a **Secret Badge**!",
        "You unlocked **Special Permissions**!"
      ];
      const randomReward = rewards[Math.floor(Math.random() * rewards.length)];
      
      message.reply(`🎁 You opened the Mystery Box! ${randomReward}`);
    }

    // Admin-Only Spy Command
    if (message.content.startsWith('!spy') && message.member.permissions.has('ADMINISTRATOR')) {
      const user = message.mentions.users.first();
      if (user) {
        const logChannel = message.guild.channels.cache.get('1364901701026316308');
        logChannel.send(`Admin is spying on ${user.tag}`);
        message.reply(`You are now spying on ${user.tag}.`);
      }
    }
  });
}

module.exports = { setupStealthCommands };
