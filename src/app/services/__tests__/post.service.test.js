/**
 * Unit tests for post.service: like (toggleLikePost), comment (addComment).
 * Mocks: storage, eventBus (infra); Post, Like, Comment, User (models).
 */

jest.mock('../../../core/infra/storage');
jest.mock('../../../core/infra/eventBus');
jest.mock('../../../models/social/Post');
jest.mock('../../../models/social/Like');
jest.mock('../../../models/social/Comment');
jest.mock('../../../models/authorization/User');

const AppError = require('../../../core/errors/AppError');
const mongoose = require('mongoose');
const Post = require('../../../models/social/Post');
const Like = require('../../../models/social/Like');
const Comment = require('../../../models/social/Comment');
const User = require('../../../models/authorization/User');
const postService = require('../post.service');

describe('post.service', () => {
    const mockUserId = new mongoose.Types.ObjectId();
    const mockPostId = new mongoose.Types.ObjectId();
    const mockUser = {
        _id: mockUserId,
        profile: { name: { first: 'A', last: 'B', full: 'A B' }, email: 'a@b.com', profileImage: '' }
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('toggleLikePost', () => {
        it('throws AppError for invalid post ID', async () => {
            await expect(
                postService.toggleLikePost(mockUser, null, 'like')
            ).rejects.toThrow(AppError);
            await expect(
                postService.toggleLikePost(mockUser, 'not-an-object-id', 'like')
            ).rejects.toThrow(AppError);
        });

        it('throws AppError for invalid reaction type', async () => {
            Like.findOne.mockResolvedValue(null);
            Like.create.mockResolvedValue({
                content: 'post',
                contentId: mockPostId,
                likes: [[], [], [], [], [], []],
                save: jest.fn().mockResolvedValue(undefined)
            });
            Post.findById.mockResolvedValue({ _id: mockPostId, userId: mockUser, caption: '', media: [] });

            await expect(
                postService.toggleLikePost(mockUser, mockPostId.toString(), 'invalid_reaction')
            ).rejects.toThrow(AppError);
        });

        it('returns post, action liked, and isLiked true when user likes', async () => {
            const likeDoc = {
                content: 'post',
                contentId: mockPostId,
                likes: [[], [], [], [], [], []],
                save: jest.fn().mockResolvedValue(undefined)
            };
            Like.findOne.mockResolvedValue(likeDoc);
            const postDoc = {
                _id: mockPostId,
                userId: { _id: mockUserId, profile: mockUser.profile },
                caption: 'Hi',
                media: [],
                likeCount: 0,
                likes: [[], [], [], [], [], []]
            };
            Post.findById.mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(postDoc)
            });
            Comment.findOne.mockResolvedValue(null);
            Comment.getCommentsByContent.mockResolvedValue([]);

            const result = await postService.toggleLikePost(
                mockUser,
                mockPostId.toString(),
                'like'
            );

            expect(result).toHaveProperty('post');
            expect(result).toHaveProperty('action', 'liked');
            expect(result).toHaveProperty('isLiked', true);
            expect(result).toHaveProperty('reaction', 'like');
            expect(likeDoc.save).toHaveBeenCalled();
        });

        it('returns action unliked when user removes like', async () => {
            const likeDoc = {
                content: 'post',
                contentId: mockPostId,
                likes: [[], [], [], [], [], [mockUserId]],
                save: jest.fn().mockResolvedValue(undefined)
            };
            Like.findOne.mockResolvedValue(likeDoc);
            const postDoc = {
                _id: mockPostId,
                userId: { _id: mockUserId, profile: mockUser.profile },
                caption: 'Hi',
                media: [],
                likes: [[], [], [], [], [], [mockUserId]]
            };
            Post.findById.mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(postDoc)
            });
            Comment.findOne.mockResolvedValue(null);
            Comment.getCommentsByContent.mockResolvedValue([]);

            const result = await postService.toggleLikePost(
                mockUser,
                mockPostId.toString(),
                'like'
            );

            expect(result.action).toBe('unliked');
            expect(result.isLiked).toBe(false);
        });
    });

    describe('addComment', () => {
        it('throws AppError for invalid post ID', async () => {
            await expect(
                postService.addComment(mockUser, null, { text: 'Hello' })
            ).rejects.toThrow(AppError);
            await expect(
                postService.addComment(mockUser, 'invalid', { text: 'Hello' })
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when comment text is empty', async () => {
            await expect(
                postService.addComment(mockUser, mockPostId.toString(), { text: '' })
            ).rejects.toThrow(AppError);
            await expect(
                postService.addComment(mockUser, mockPostId.toString(), { text: '   ' })
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when post not found', async () => {
            Post.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(null)
            });
            await expect(
                postService.addComment(mockUser, mockPostId.toString(), { text: 'Hello' })
            ).rejects.toThrow(AppError);
        });

        it('returns comment and post when adding top-level comment', async () => {
            const postDoc = {
                _id: mockPostId,
                userId: { _id: mockUserId, profile: mockUser.profile },
                caption: 'Hi',
                media: [],
                likeCount: 0,
                commentCount: 0,
                likes: [[], [], [], [], [], []]
            };
            Post.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(postDoc)
            });
            const newComment = {
                _id: new mongoose.Types.ObjectId(),
                userId: mockUserId,
                text: 'Hello',
                createdAt: new Date(),
                replies: []
            };
            const commentDoc = {
                addComment: jest.fn().mockResolvedValue(newComment),
                comments: [newComment]
            };
            Comment.getOrCreateCommentDoc.mockResolvedValue(commentDoc);
            Comment.getCommentsByContent.mockResolvedValue([]);
            Comment.findOne.mockResolvedValue({ comments: [] });
            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue(mockUser)
            });

            const result = await postService.addComment(mockUser, mockPostId.toString(), {
                text: 'Hello'
            });

            expect(result).toHaveProperty('comment');
            expect(result).toHaveProperty('post');
            expect(result).toHaveProperty('message', 'Comment added successfully');
            expect(result.comment).toMatchObject({ text: 'Hello' });
            expect(commentDoc.addComment).toHaveBeenCalledWith(mockUserId, 'Hello');
        });
    });
});
