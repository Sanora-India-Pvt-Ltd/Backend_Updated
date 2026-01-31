const videoService = require('../../app/services/video.service');

const uploadVideoController = async (req, res) => {
    const result = await videoService.uploadVideo(req.body, req.file, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const getVideo = async (req, res) => {
    const result = await videoService.getVideo(req.params.id, req.userId);
    res.status(result.statusCode).json(result.json);
};

const getPlaylistVideos = async (req, res) => {
    const result = await videoService.getPlaylistVideos(req.params.playlistId, req.userId);
    res.status(result.statusCode).json(result.json);
};

const updateVideo = async (req, res) => {
    const result = await videoService.updateVideo(req.params.id, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const deleteVideoController = async (req, res) => {
    const result = await videoService.deleteVideo(req.params.id, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const updateVideoThumbnail = async (req, res) => {
    const result = await videoService.updateVideoThumbnail(req.params.id, req.universityId, req.file);
    res.status(result.statusCode).json(result.json);
};

const trackProductView = async (req, res) => {
    const result = await videoService.trackProductView(req.params.videoId, req.userId);
    res.status(result.statusCode).json(result.json);
};

const trackProductClick = async (req, res) => {
    const result = await videoService.trackProductClick(req.params.videoId, req.userId);
    res.status(result.statusCode).json(result.json);
};

const getVideoQuestions = async (req, res) => {
    const result = await videoService.getVideoQuestionsForLearner(req.params.videoId);
    res.status(result.statusCode).json(result.json);
};

module.exports = {
    uploadVideo: uploadVideoController,
    getVideo,
    getPlaylistVideos,
    updateVideo,
    deleteVideo: deleteVideoController,
    updateVideoThumbnail,
    trackProductView,
    trackProductClick,
    getVideoQuestions
};
