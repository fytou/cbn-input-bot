require('dotenv').config();

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  
  // Default Team Leader & Vendor Info
  DEFAULT_VENDOR: process.env.DEFAULT_VENDOR || 'PT. Milfha Mutiara Prima',
  DEFAULT_TL_CODE: process.env.DEFAULT_TL_CODE || 'MMP038',
  DEFAULT_TL_NAME: process.env.DEFAULT_TL_NAME || 'fito nardian',
  DEFAULT_AE_NAME: process.env.DEFAULT_AE_NAME || 'Cece novita sari',

  // Default Package
  DEFAULT_SERVICE: process.env.DEFAULT_SERVICE || 'CBN FIBER, FIBER 20',

  // Template Paths
  TEMPLATES: {
    'FB 20': 'templates/template_fb20.png',
    'FB 100': 'templates/template_fb100.png'
  }
};
