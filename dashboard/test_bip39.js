try {
  const bip39 = require('bip39');
  const generated = bip39.generateMnemonic();
  console.log('Generated:', generated);
  console.log('Is valid:', bip39.validateMnemonic(generated));
  
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  console.log('Phrase about Is valid:', bip39.validateMnemonic(phrase));
} catch (e) {
  console.error('Error:', e);
}
