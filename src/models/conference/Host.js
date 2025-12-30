const mongoose = require('mongoose');
const ConferenceAccount = require('./ConferenceAccount');

// Host discriminator on shared ConferenceAccount collection
// Check if discriminator already exists to avoid re-registration errors
let Host;
if (ConferenceAccount.discriminators && ConferenceAccount.discriminators['HOST']) {
    // Discriminator already exists, use it
    Host = ConferenceAccount.discriminators['HOST'];
} else {
    // Create the discriminator
    const hostSchema = new mongoose.Schema({}, { _id: false });
    Host = ConferenceAccount.discriminator('HOST', hostSchema);
}

// Register the discriminator as a model so Mongoose populate can find it
// This is needed because populate looks for mongoose.models['Host']
// Discriminators are already models, so we manually add them to mongoose.models
if (!mongoose.models.Host) {
    mongoose.models.Host = Host;
}

module.exports = Host;

