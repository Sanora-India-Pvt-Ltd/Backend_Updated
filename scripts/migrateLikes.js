require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('../src/models/Post');
const Reel = require('../src/models/Reel');
const Like = require('../src/models/Like');

const reactionMap = {
    0: 'happy',
    1: 'sad',
    2: 'angry',
    3: 'hug',
    4: 'wow',
    5: 'like'
};

async function migrateLikes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Migrate post likes
        const posts = await Post.find({ 'likes.0': { $exists: true } });
        console.log(`Found ${posts.length} posts with likes to migrate`);

        for (const post of posts) {
            const bulkOps = [];
            let likeCount = 0;

            // Process each reaction type
            post.likes.forEach((userIds, index) => {
                if (!userIds || !Array.isArray(userIds)) return;
                
                const reaction = reactionMap[index];
                if (!reaction) return;

                likeCount += userIds.length;

                // Add bulk write operation for each like
                userIds.forEach(userId => {
                    bulkOps.push({
                        updateOne: {
                            filter: {
                                user: userId,
                                content: 'post',
                                contentId: post._id
                            },
                            update: {
                                $setOnInsert: {
                                    user: userId,
                                    content: 'post',
                                    contentId: post._id,
                                    reaction
                                }
                            },
                            upsert: true
                        }
                    });
                });
            });

            if (bulkOps.length > 0) {
                await Like.bulkWrite(bulkOps, { ordered: false });
                console.log(`Migrated ${bulkOps.length} likes for post ${post._id}`);
            }

            // Update post with likeCount and remove old likes array
            post.likeCount = likeCount;
            post.likes = undefined;
            await post.save();
        }

        console.log('Post likes migration completed');

        // Migrate reel likes (similar to posts)
        const reels = await Reel.find({ 'likes.0': { $exists: true } });
        console.log(`Found ${reels.length} reels with likes to migrate`);

        for (const reel of reels) {
            const bulkOps = [];
            let likeCount = 0;

            reel.likes.forEach((userIds, index) => {
                if (!userIds || !Array.isArray(userIds)) return;
                
                const reaction = reactionMap[index];
                if (!reaction) return;

                likeCount += userIds.length;

                userIds.forEach(userId => {
                    bulkOps.push({
                        updateOne: {
                            filter: {
                                user: userId,
                                content: 'reel',
                                contentId: reel._id
                            },
                            update: {
                                $setOnInsert: {
                                    user: userId,
                                    content: 'reel',
                                    contentId: reel._id,
                                    reaction
                                }
                            },
                            upsert: true
                        }
                    });
                });
            });

            if (bulkOps.length > 0) {
                await Like.bulkWrite(bulkOps, { ordered: false });
                console.log(`Migrated ${bulkOps.length} likes for reel ${reel._id}`);
            }

            reel.likeCount = likeCount;
            reel.likes = undefined;
            await reel.save();
        }

        console.log('Reel likes migration completed');
        console.log('All migrations completed successfully');

    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

migrateLikes();
