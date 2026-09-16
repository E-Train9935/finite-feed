const requiredProduction = ['SESSION_SECRET'];
const missing = requiredProduction.filter((key) => !process.env[key]);
if (process.env.NODE_ENV === 'production' && missing.length) {
  console.error(`Missing production variables: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Environment looks valid for the selected mode.');
