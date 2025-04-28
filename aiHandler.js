const { Client } = require('discord.js');

function handleMessage(message) {
  if (message.author?.bot) return null;
  return null;
}

function toggleBloodMode(status) {
  return status === 'on';
}

module.exports = {
  handleMessage,
  toggleBloodMode
};