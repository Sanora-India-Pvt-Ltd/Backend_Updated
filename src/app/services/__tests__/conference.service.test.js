/**
 * Unit tests for conference.service: permissions (updateConference), question flow (addQuestion, pushQuestionLive).
 * Mocks: cache, realtime (infra); Conference, ConferenceQuestion, Speaker, etc. (models).
 */

jest.mock('../../../core/infra/cache');
jest.mock('../../../core/infra/realtime');
jest.mock('../../../models/conference/Conference');
jest.mock('../../../models/conference/ConferenceQuestion');
jest.mock('../../../models/conference/Speaker');

const AppError = require('../../../core/errors/AppError');
const mongoose = require('mongoose');
const cache = require('../../../core/infra/cache');
const realtime = require('../../../core/infra/realtime');
const conferenceService = require('../conference.service');

describe('conference.service', () => {
    const mockConferenceId = new mongoose.Types.ObjectId().toString();
    const mockQuestionId = new mongoose.Types.ObjectId().toString();
    const mockHostId = new mongoose.Types.ObjectId();

    describe('updateConference (permissions)', () => {
        it('throws AppError when user role is not HOST or SUPER_ADMIN', async () => {
            const conference = {
                _id: mockConferenceId,
                title: 'Test',
                description: '',
                hostId: mockHostId,
                speakers: [],
                save: jest.fn().mockResolvedValue(undefined),
                populate: jest.fn().mockReturnThis()
            };

            await expect(
                conferenceService.updateConference(
                    conference,
                    { title: 'Updated' },
                    'SPEAKER',
                    {}
                )
            ).rejects.toThrow(AppError);

            await expect(
                conferenceService.updateConference(
                    conference,
                    { title: 'Updated' },
                    'USER',
                    {}
                )
            ).rejects.toThrow(AppError);
        });

        it('updates conference when user role is HOST', async () => {
            const Speaker = require('../../../models/conference/Speaker');
            const conference = {
                _id: mockConferenceId,
                title: 'Old',
                description: '',
                hostId: mockHostId,
                speakers: [],
                pptUrl: null,
                save: jest.fn().mockResolvedValue(undefined),
                populate: jest.fn().mockReturnThis()
            };
            Speaker.find.mockResolvedValue([]);

            const result = await conferenceService.updateConference(
                conference,
                { title: 'New Title' },
                'HOST',
                {}
            );

            expect(conference.title).toBe('New Title');
            expect(conference.save).toHaveBeenCalled();
        });
    });

    describe('addQuestion (question flow)', () => {
        it('throws AppError when user role is not HOST or SPEAKER', async () => {
            const req = {
                userRole: 'USER',
                user: { profile: { email: 'u@test.com' } }
            };

            await expect(
                conferenceService.addQuestion(
                    mockConferenceId,
                    {
                        questionText: 'Q?',
                        options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
                        correctOption: 'A'
                    },
                    req
                )
            ).rejects.toThrow(AppError);
        });

        it('throws AppError when question text is empty', async () => {
            const Speaker = require('../../../models/conference/Speaker');
            const req = {
                userRole: 'HOST',
                hostUser: { _id: mockHostId },
                user: { _id: mockHostId }
            };
            Speaker.findOne.mockResolvedValue(null);

            await expect(
                conferenceService.addQuestion(
                    mockConferenceId,
                    {
                        questionText: '   ',
                        options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
                        correctOption: 'A'
                    },
                    req
                )
            ).rejects.toThrow(AppError);
        });

        it('creates question when HOST provides valid body', async () => {
            const ConferenceQuestion = require('../../../models/conference/ConferenceQuestion');
            const Speaker = require('../../../models/conference/Speaker');
            Speaker.findOne.mockResolvedValue(null);
            const mockQuestion = {
                _id: mockQuestionId,
                conferenceId: mockConferenceId,
                questionText: 'Q?',
                options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
                correctOption: 'A',
                order: 1,
                status: 'IDLE'
            };
            ConferenceQuestion.findOne.mockReturnValue({
                sort: jest.fn().mockResolvedValue(null)
            });
            ConferenceQuestion.create.mockResolvedValue(mockQuestion);
            Speaker.findOne.mockResolvedValue(null);

            const req = {
                userRole: 'HOST',
                hostUser: { _id: mockHostId },
                user: { _id: mockHostId }
            };

            const result = await conferenceService.addQuestion(
                mockConferenceId,
                {
                    questionText: 'Q?',
                    options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
                    correctOption: 'A'
                },
                req
            );

            expect(result).toMatchObject({ questionText: 'Q?', correctOption: 'A' });
            expect(ConferenceQuestion.create).toHaveBeenCalled();
        });
    });

    describe('pushQuestionLive (question flow + infra)', () => {
        it('throws AppError when Redis (cache) is unavailable', async () => {
            cache.getClient.mockReturnValue(null);

            const req = {
                userRole: 'HOST',
                conference: { _id: mockConferenceId, status: 'ACTIVE' },
                user: {}
            };
            const ConferenceQuestion = require('../../../models/conference/ConferenceQuestion');
            const Speaker = require('../../../models/conference/Speaker');
            Speaker.findOne.mockResolvedValue(null);
            ConferenceQuestion.findById.mockResolvedValue({
                _id: mockQuestionId,
                conferenceId: mockConferenceId,
                questionText: 'Q?',
                options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
                createdById: mockHostId
            });

            await expect(
                conferenceService.pushQuestionLive(
                    mockConferenceId,
                    mockQuestionId,
                    { duration: 45 },
                    req
                )
            ).rejects.toThrow(AppError);
        });

        it('returns question, startedAt, expiresAt when cache and realtime are available', async () => {
            const mockRedis = {
                set: jest.fn().mockResolvedValue('OK'),
                get: jest.fn().mockResolvedValue(null),
                setex: jest.fn().mockResolvedValue('OK'),
                expire: jest.fn().mockResolvedValue(1)
            };
            cache.getClient.mockReturnValue(mockRedis);
            realtime.getIO.mockReturnValue({ to: jest.fn(() => ({ emit: jest.fn() })), emit: jest.fn() });
            realtime.getQuestionTimers.mockReturnValue(new Map());

            const ConferenceQuestion = require('../../../models/conference/ConferenceQuestion');
            const Speaker = require('../../../models/conference/Speaker');
            Speaker.findOne.mockResolvedValue(null);
            const mockQuestion = {
                _id: mockQuestionId,
                conferenceId: mockConferenceId,
                questionText: 'Q?',
                options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
                slideIndex: null,
                save: jest.fn().mockResolvedValue(undefined)
            };
            ConferenceQuestion.findById.mockResolvedValue(mockQuestion);
            Speaker.findOne.mockResolvedValue(null);

            const req = {
                userRole: 'HOST',
                conference: { _id: mockConferenceId, status: 'ACTIVE' },
                user: { _id: mockHostId }
            };

            const result = await conferenceService.pushQuestionLive(
                mockConferenceId,
                mockQuestionId,
                { duration: 45 },
                req
            );

            expect(result).toHaveProperty('question');
            expect(result).toHaveProperty('startedAt');
            expect(result).toHaveProperty('expiresAt');
            expect(mockRedis.set).toHaveBeenCalled();
            expect(realtime.getIO).toHaveBeenCalled();
            expect(realtime.getQuestionTimers).toHaveBeenCalled();
        });
    });
});
