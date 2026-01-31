/**
 * Playlist domain: CRUD for course playlists. Returns { statusCode, json }.
 */

const Playlist = require('../../models/course/Playlist');
const Video = require('../../models/course/Video');
const Course = require('../../models/course/Course');

async function createPlaylist(courseId, universityId, body) {
    try {
        const { name, description, thumbnail, order } = body;
        const course = await Course.findById(courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to create playlists for this course' } };
        }
        const playlist = await Playlist.create({
            courseId,
            name,
            description: description || '',
            thumbnail: thumbnail || null,
            order: order || 0
        });
        return { statusCode: 201, json: { success: true, message: 'Playlist created successfully', data: { playlist } } };
    } catch (error) {
        console.error('Create playlist error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error creating playlist', error: error.message } };
    }
}

async function getPlaylists(courseId) {
    try {
        const playlists = await Playlist.find({ courseId }).sort({ order: 1, createdAt: 1 }).lean();
        return { statusCode: 200, json: { success: true, message: 'Playlists retrieved successfully', data: { playlists } } };
    } catch (error) {
        console.error('Get playlists error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving playlists', error: error.message } };
    }
}

async function updatePlaylist(id, universityId, body) {
    try {
        const { name, description, thumbnail, order } = body;
        const playlist = await Playlist.findById(id).populate('courseId');
        if (!playlist) {
            return { statusCode: 404, json: { success: false, message: 'Playlist not found' } };
        }
        const course = await Course.findById(playlist.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to update this playlist' } };
        }
        if (name !== undefined) playlist.name = name;
        if (description !== undefined) playlist.description = description;
        if (thumbnail !== undefined) playlist.thumbnail = thumbnail;
        if (order !== undefined) playlist.order = order;
        await playlist.save();
        return { statusCode: 200, json: { success: true, message: 'Playlist updated successfully', data: { playlist } } };
    } catch (error) {
        console.error('Update playlist error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating playlist', error: error.message } };
    }
}

async function deletePlaylist(id, universityId) {
    try {
        const playlist = await Playlist.findById(id);
        if (!playlist) {
            return { statusCode: 404, json: { success: false, message: 'Playlist not found' } };
        }
        const course = await Course.findById(playlist.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this playlist' } };
        }
        await Video.deleteMany({ playlistId: id });
        await Playlist.findByIdAndDelete(id);
        return { statusCode: 200, json: { success: true, message: 'Playlist deleted successfully' } };
    } catch (error) {
        console.error('Delete playlist error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error deleting playlist', error: error.message } };
    }
}

module.exports = {
    createPlaylist,
    getPlaylists,
    updatePlaylist,
    deletePlaylist
};
