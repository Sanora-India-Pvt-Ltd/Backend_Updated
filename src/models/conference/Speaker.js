const mongoose = require('mongoose');
const ConferenceAccount = require('./ConferenceAccount');

// Speaker discriminator on shared ConferenceAccount collection
// Check if discriminator already exists to avoid re-registration errors
let Speaker;
if (ConferenceAccount.discriminators && ConferenceAccount.discriminators['SPEAKER']) {
    // Discriminator already exists, use it
    Speaker = ConferenceAccount.discriminators['SPEAKER'];
} else {
    // Create the discriminator
    const speakerSchema = new mongoose.Schema({}, { _id: false });
    Speaker = ConferenceAccount.discriminator('SPEAKER', speakerSchema);
}

// Register the discriminator as a model so Mongoose populate can find it
// This is needed because populate looks for mongoose.models['Speaker']
// Discriminators are already models, so we manually add them to mongoose.models
if (!mongoose.models.Speaker) {
    mongoose.models.Speaker = Speaker;
}

module.exports = Speaker;

