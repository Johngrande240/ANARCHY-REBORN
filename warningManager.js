const fs = require('fs');
const warningFile = './warnings.json';

class WarningManager {
  static #warnings = new Map();
  static #WARNING_LIMIT = 3;

  static loadWarnings() {
    try {
      if (fs.existsSync(warningFile)) {
        const data = JSON.parse(fs.readFileSync(warningFile));
        this.#warnings = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Error loading warnings:', error);
    }
  }

  static saveWarnings() {
    try {
      const data = Object.fromEntries(this.#warnings);
      fs.writeFileSync(warningFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving warnings:', error);
    }
  }

  static getWarnings(userId) {
    return this.#warnings.get(userId)?.count || 0;
  }

  static addWarning(userId, reason) {
    const warning = this.#warnings.get(userId) || { count: 0, reasons: [] };
    warning.count++;
    warning.reasons.push({ reason, timestamp: Date.now() });
    this.#warnings.set(userId, warning);
    this.saveWarnings();
    return warning.count;
  }

  static clearWarnings(userId) {
    this.#warnings.delete(userId);
    this.saveWarnings();
  }

  static shouldTakeAction(userId) {
    const warnings = this.getWarnings(userId);
    return warnings >= this.#WARNING_LIMIT;
  }
}

WarningManager.loadWarnings();
module.exports = WarningManager;