const playlistService = require('../../app/services/playlist.service');

const createPlaylist = async (req, res) => {
    const result = await playlistService.createPlaylist(req.params.courseId, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const getPlaylists = async (req, res) => {
    const result = await playlistService.getPlaylists(req.params.courseId);
    res.status(result.statusCode).json(result.json);
};

const updatePlaylist = async (req, res) => {
    const result = await playlistService.updatePlaylist(req.params.id, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const deletePlaylist = async (req, res) => {
    const result = await playlistService.deletePlaylist(req.params.id, req.universityId);
    res.status(result.statusCode).json(result.json);
};

module.exports = {
    createPlaylist,
    getPlaylists,
    updatePlaylist,
    deletePlaylist
};
