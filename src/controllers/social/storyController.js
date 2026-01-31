/**
 * Thin story controller: reads req, calls storyService, sends same JSON.
 */

const storyService = require('../../app/services/story.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

const createStory = async (req, res) => {
    const result = await storyService.createStory(req.user, req.body);
    respond(res, result);
};

const getUserStories = async (req, res) => {
    const result = await storyService.getUserStories(req.params.id, req.user?._id);
    respond(res, result);
};

const getAllFriendsStories = async (req, res) => {
    const result = await storyService.getAllFriendsStories(req.user);
    respond(res, result);
};

const uploadStoryMedia = async (req, res) => {
    const result = await storyService.uploadStoryMedia(req.user, req.file);
    respond(res, result);
};

module.exports = {
    createStory,
    getUserStories,
    getAllFriendsStories,
    uploadStoryMedia
};
