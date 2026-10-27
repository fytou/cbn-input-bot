const fs = require('fs');
const path = require('path');
const config = require('./config');

const TEAM_FILE = path.resolve(__dirname, '../data/team.json');
const PROFILES_FILE = path.resolve(__dirname, '../data/profiles.json');

function ensureDir() {
  const dir = path.dirname(TEAM_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTeam() {
  ensureDir();
  if (!fs.existsSync(TEAM_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TEAM_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveTeam(team) {
  ensureDir();
  fs.writeFileSync(TEAM_FILE, JSON.stringify(team, null, 2), 'utf8');
}

function loadProfiles() {
  ensureDir();
  if (!fs.existsSync(PROFILES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveProfiles(profiles) {
  ensureDir();
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf8');
}

/**
 * Finds team record by AE query
 * @param {string} aeQuery 
 * @returns {Object|null}
 */
function findTeamByAE(aeQuery) {
  if (!aeQuery) return null;
  const q = aeQuery.trim().toLowerCase();
  const team = loadTeam();

  // Exact or alias match
  for (const item of team) {
    if (item.aeName.toLowerCase() === q) return item;
    if (item.aliases && item.aliases.some(a => a.toLowerCase() === q || q.includes(a.toLowerCase()))) {
      return item;
    }
  }

  // Partial match
  for (const item of team) {
    if (item.aeName.toLowerCase().includes(q) || q.includes(item.aeName.toLowerCase())) {
      return item;
    }
  }

  return null;
}

/**
 * Register or update AE mapping to TL
 */
function registerTeamMember(aeName, tlCode, tlName, vendor = config.DEFAULT_VENDOR) {
  const team = loadTeam();
  const existingIdx = team.findIndex(t => t.aeName.toLowerCase() === aeName.trim().toLowerCase());
  
  const alias = aeName.trim().toLowerCase();
  const aliases = [alias];
  const firstWord = alias.split(' ')[0];
  if (firstWord && !aliases.includes(firstWord)) aliases.push(firstWord);

  const entry = {
    aeName: aeName.trim(),
    aliases,
    tlCode: tlCode.trim(),
    tlName: tlName.trim(),
    vendor: vendor.trim()
  };

  if (existingIdx >= 0) {
    team[existingIdx] = entry;
  } else {
    team.push(entry);
  }

  saveTeam(team);
  return entry;
}

/**
 * Get user personal profile
 */
function getUserProfile(userId) {
  const profiles = loadProfiles();
  return profiles[userId] || null;
}

/**
 * Set user personal profile
 */
function setUserProfile(userId, profile) {
  const profiles = loadProfiles();
  profiles[userId] = {
    ...profiles[userId],
    ...profile
  };
  saveProfiles(profiles);
  return profiles[userId];
}

module.exports = {
  loadTeam,
  findTeamByAE,
  registerTeamMember,
  getUserProfile,
  setUserProfile
};
