const asyncHandler = require('../../core/utils/asyncHandler');
const postService = require('../../app/services/post.service');

const createPost = asyncHandler(async (req, res) => {
    const files = req.files || (req.file ? [req.file] : []);
    const result = await postService.createPost(req.user, req.body, files);
    return res.status(201).json({
        success: true,
        message: result.message,
        data: { post: result.post }
    });
});

const getAllPosts = asyncHandler(async (req, res) => {
    const result = await postService.getAllPosts(req.query, req.user?._id);
    return res.status(200).json({
        success: true,
        message: result.message,
        data: {
            posts: result.posts,
            pagination: result.pagination
        }
    });
});

const getMyPosts = asyncHandler(async (req, res) => {
    const result = await postService.getMyPosts(req.user, req.query);
    return res.status(200).json({
        success: true,
        message: result.message,
        data: {
            user: result.user,
            posts: result.posts,
            pagination: result.pagination
        }
    });
});

const getUserPosts = asyncHandler(async (req, res) => {
    const result = await postService.getUserPosts(
        req.params.id,
        req.query,
        req.user?._id
    );
    return res.status(200).json({
        success: true,
        message: result.message,
        data: {
            user: result.user,
            posts: result.posts,
            pagination: result.pagination
        }
    });
});

const uploadPostMedia = asyncHandler(async (req, res) => {
    const result = await postService.uploadPostMedia(req.user, req.file);
    return res.status(200).json({
        success: true,
        message: 'Media uploaded successfully',
        data: result
    });
});

const toggleLikePost = asyncHandler(async (req, res) => {
    const result = await postService.toggleLikePost(
        req.user,
        req.params.id,
        req.body.reaction
    );
    return res.status(200).json({
        success: true,
        message: `Post ${result.action} successfully`,
        data: {
            post: result.post,
            action: result.action,
            reaction: result.reaction,
            isLiked: result.isLiked
        }
    });
});

const deletePost = asyncHandler(async (req, res) => {
    await postService.deletePost(req.user, req.params.id);
    return res.status(200).json({
        success: true,
        message: 'Post deleted successfully'
    });
});

const addComment = asyncHandler(async (req, res) => {
    const result = await postService.addComment(
        req.user,
        req.params.id,
        req.body
    );
    const status = result.reply ? 201 : 201;
    const payload = {
        success: true,
        message: result.message,
        data: result.reply
            ? { reply: result.reply, post: result.post }
            : { comment: result.comment, post: result.post }
    };
    return res.status(status).json(payload);
});

const deleteComment = asyncHandler(async (req, res) => {
    const result = await postService.deleteComment(
        req.user,
        req.params.id,
        req.params.commentId,
        req.query.replyId
    );
    return res.status(200).json({
        success: true,
        message: result.message,
        data: { post: result.post }
    });
});

const reportPost = asyncHandler(async (req, res) => {
    const result = await postService.reportPost(
        req.user,
        req.params.id,
        req.body.reason
    );
    return res.status(200).json({
        success: true,
        message: result.message,
        data: { postDeleted: result.postDeleted }
    });
});

module.exports = {
    createPost,
    getAllPosts,
    getMyPosts,
    getUserPosts,
    uploadPostMedia,
    toggleLikePost,
    deletePost,
    addComment,
    deleteComment,
    reportPost
};
